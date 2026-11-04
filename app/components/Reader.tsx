'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { splitIngredient } from '@/lib/recipe';
import { applyHighlights, highlightAt, planHighlight, selectionOffsets } from '@/lib/highlights';
import type { LinkNote, LinkRow } from '@/lib/schema';
import styles from './Reader.module.css';
import { ReaderSettingsSheet, loadSettings, saveSettings, settingsAttributes, type ReaderSettings } from './ReaderSettings';

type ContentState = { status: 'loading' } | { status: 'ready'; html: string; recipe: boolean } | { status: 'failed' };

type Sheet = 'settings' | 'note' | null;

// Matches the slideOut animation in Reader.module.css.
const SLIDE_OUT_MS = 280;
// Width of the strip along the left edge where Safari starts its own back gesture.
const SAFARI_EDGE_PX = 30;

function isStandalone(): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// How long a swipe that wasn't far enough takes to spring back.
const DRAG_FINISH_MS = 260;

function formatPublished(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(date);
}

function formatNoteDate(value: string): string {
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// A recipe's ingredients (see lib/recipe.ts) as one table: amount on the left, ingredient on the right,
// with a row for each group name ("Voor de saus").
function withIngredientTable(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const heading = Array.from(doc.querySelectorAll('[data-recipe] > h2')).find(
    (element) => element.textContent === 'Ingrediënten',
  );
  const parts: Element[] = [];
  for (let element = heading?.nextElementSibling; element && element.tagName !== 'H2'; element = element.nextElementSibling) {
    parts.push(element);
  }
  if (!heading || !parts.some((part) => part.tagName === 'UL')) return html;

  // Built with textContent, so nothing from the saved html ends up as markup.
  const table = doc.createElement('table');
  table.className = styles.ingredients;
  const head = table.createTHead().insertRow();
  for (const label of ['Hoeveelheid', 'Ingrediënt']) {
    const cell = doc.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    head.append(cell);
  }
  for (const part of parts) {
    // Each group gets its own body, so the row colours start over per group.
    const body = table.createTBody();
    if (part.tagName === 'H3') {
      const cell = doc.createElement('th');
      cell.scope = 'rowgroup';
      cell.colSpan = 2;
      cell.className = styles.ingredientGroup;
      cell.textContent = part.textContent;
      body.insertRow().append(cell);
      continue;
    }
    for (const item of Array.from(part.children)) {
      const { amount, name } = splitIngredient(item.textContent ?? '');
      const row = body.insertRow();
      row.insertCell().textContent = amount;
      row.insertCell().textContent = name;
    }
  }
  parts.forEach((part) => part.remove());
  heading.after(table);
  return doc.body.innerHTML;
}

// Full-screen reader for the saved article text, sliding in like an iOS navigation push.
// `actions` are the item's buttons (the "..." menu), shown in the top bar;
// `labels` (category and tags) go above the title; `onChange` gets the item back after a note changed.
export default function Reader({
  link,
  domain,
  actions,
  labels,
  onChange,
  onClose,
}: {
  link: LinkRow;
  domain: string;
  actions: ReactNode;
  labels?: ReactNode;
  onChange?: (link: LinkRow) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState<ContentState>({ status: 'loading' });
  const backButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const noteButton = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [sheet, setSheet] = useState<Sheet>(null);
  const sheetRef = useRef<Sheet>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  // Text selected in the article, with where the "Onderzoek" button goes (just below the selection).
  // Text selected in the article body, with where the Highlight button goes (just below it), and,
  // when the selection lies within a highlight, which one (the button then takes it away).
  const [passage, setPassage] = useState<{ top: number; left: number; insideId: string | null } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The selected stretch of text, kept because tapping a button can clear the live selection first.
  const selectedOffsets = useRef<{ start: number; end: number } | null>(null);
  // A tapped highlight in the article, with where its "Highlight weg" button goes.
  const [activeMark, setActiveMark] = useState<{ id: string; top: number; left: number } | null>(null);
  const [savingHighlight, setSavingHighlight] = useState(false);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  function changeSettings(next: ReaderSettings) {
    setSettings(next);
    saveSettings(next);
  }

  // Closes the open sheet and puts focus back on the button that opened it.
  function closeSheet() {
    const button = sheetRef.current === 'note' ? noteButton : settingsButton;
    setSheet(null);
    button.current?.focus({ focusVisible: false } as FocusOptions);
  }

  async function deleteNote(note: LinkNote) {
    if (!window.confirm('Weet je zeker dat je deze notitie wilt verwijderen?')) return;
    setDeletingNoteId(note.id);
    try {
      const res = await fetch(`/api/links/${link.id}/notes/${note.id}`, { method: 'DELETE' });
      if (res.ok) onChange?.(await res.json());
    } finally {
      setDeletingNoteId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/links/${link.id}/content`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { html: string; recipe?: boolean }) => {
        if (!cancelled) setContent({ status: 'ready', html: data.html, recipe: data.recipe === true });
      })
      .catch(() => {
        if (!cancelled) setContent({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [link.id]);

  // The list behind stays put while reading; Escape closes the settings first, then goes back.
  useEffect(() => {
    // Focus for keyboard and screen readers, without drawing a focus ring after a tap.
    backButton.current?.focus({ focusVisible: false } as FocusOptions);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (sheetRef.current) {
        const button = sheetRef.current === 'note' ? noteButton : settingsButton;
        setSheet(null);
        button.current?.focus({ focusVisible: false } as FocusOptions);
      } else {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Follows the text selection in the article body: a selection shows the Highlight button below it.
  // When the selection disappears the button waits a moment, so a tap on it still counts.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      const selection = document.getSelection();
      const body = bodyRef.current;
      const offsets =
        selection && !selection.isCollapsed && body ? selectionOffsets(body, selection.getRangeAt(0)) : null;
      if (selection && body && offsets) {
        clearTimeout(hideTimer);
        setActiveMark(null);
        selectedOffsets.current = offsets;
        const plan = planHighlight(body, offsets);
        const rect = selection.getRangeAt(0).getBoundingClientRect?.();
        const bottom = rect?.bottom ?? 0;
        const center = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const fitsBelow = bottom + 48 < window.innerHeight;
        setPassage({
          top: fitsBelow ? bottom + 8 : Math.max(8, (rect?.top ?? 0) - 42),
          left: Math.min(Math.max(center, 70), window.innerWidth - 70),
          insideId: plan.kind === 'inside' ? plan.id : null,
        });
        return;
      }
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setPassage(null), 300);
    }
    const reader = readerRef.current;
    document.addEventListener('selectionchange', update);
    reader?.addEventListener('scroll', update, { passive: true });
    const hideMarkButton = () => setActiveMark(null);
    reader?.addEventListener('scroll', hideMarkButton, { passive: true });
    return () => {
      clearTimeout(hideTimer);
      document.removeEventListener('selectionchange', update);
      reader?.removeEventListener('scroll', update);
      reader?.removeEventListener('scroll', hideMarkButton);
    };
  }, []);

  // Highlights the selected text; overlapping highlights are merged into it, so nothing is
  // highlighted twice (see planHighlight).
  async function addHighlight() {
    const body = bodyRef.current;
    const offsets = selectedOffsets.current;
    if (!body || !offsets || savingHighlight) return;
    const plan = planHighlight(body, offsets);
    if (plan.kind === 'inside') return;
    setSavingHighlight(true);
    try {
      const res = await fetch(`/api/links/${link.id}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...highlightAt(body, plan.start, plan.end), replaces: plan.replaces }),
      });
      if (res.ok) {
        document.getSelection()?.removeAllRanges();
        setPassage(null);
        onChange?.(await res.json());
      }
    } finally {
      setSavingHighlight(false);
    }
  }

  async function removeHighlight(id: string) {
    if (savingHighlight) return;
    setSavingHighlight(true);
    try {
      const res = await fetch(`/api/links/${link.id}/highlights/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveMark(null);
        document.getSelection()?.removeAllRanges();
        setPassage(null);
        onChange?.(await res.json());
      }
    } finally {
      setSavingHighlight(false);
    }
  }

  // Tapping highlighted text offers to take the highlight away again.
  function onArticleClick(event: MouseEvent<HTMLElement>) {
    const mark = event.target instanceof Element ? event.target.closest<HTMLElement>('mark[data-highlight-id]') : null;
    const selection = document.getSelection();
    if (!mark || (selection && !selection.isCollapsed)) {
      setActiveMark(null);
      return;
    }
    const rect = mark.getBoundingClientRect();
    const fitsBelow = rect.bottom + 48 < window.innerHeight;
    setActiveMark({
      id: mark.dataset.highlightId!,
      top: fitsBelow ? rect.bottom + 8 : Math.max(8, rect.top - 42),
      left: Math.min(Math.max(event.clientX || rect.left + rect.width / 2, 70), window.innerWidth - 70),
    });
  }

  // Going back slides the reader out to the right, over the overview, before it closes.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  function slideOut() {
    if (closing) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, SLIDE_OUT_MS);
  }

  // Swiping right drags the reader along with the finger, showing the overview underneath, like
  // going back in an iOS app. Let go past a third of the screen (or with a quick flick) and it
  // slides away; otherwise it springs back. Mostly-horizontal drags only, and not from inside
  // something that scrolls sideways (wide tables, code) or while text is selected.
  const swipe = useRef<{ x: number; y: number; time: number; dragging: boolean | null; dx: number } | null>(null);
  function setReaderOffset(dx: number, transition: string) {
    const reader = readerRef.current;
    if (!reader) return;
    reader.style.transition = transition;
    reader.style.transform = dx ? `translateX(${dx}px)` : '';
    reader.dataset.dragging = dx ? 'true' : '';
  }
  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    swipe.current = null;
    if (event.touches.length !== 1 || sheetRef.current || closing) return;
    for (let el = event.target as HTMLElement | null; el && el !== event.currentTarget; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX !== 'visible') return;
    }
    const touch = event.touches[0];
    // In Safari, a swipe from the left edge is Safari's own back gesture, which already slides the
    // overview in (the reader has its own history entry). Dragging the reader as well would show the
    // overview twice, so leave edge swipes to Safari. The home-screen app has no such gesture.
    if (touch.clientX < SAFARI_EDGE_PX && !isStandalone()) return;
    swipe.current = { x: touch.clientX, y: touch.clientY, time: Date.now(), dragging: null, dx: 0 };
  }
  function onTouchMove(event: TouchEvent<HTMLDivElement>) {
    const state = swipe.current;
    if (!state || state.dragging === false) return;
    const touch = event.touches[0];
    const dx = touch.clientX - state.x;
    const dy = touch.clientY - state.y;
    if (state.dragging === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Decide once: a sideways drag to the right, or something else (scrolling, selecting).
      state.dragging = dx > 0 && dx > Math.abs(dy) * 1.5 && document.getSelection()?.isCollapsed !== false;
      if (!state.dragging) return;
    }
    state.dx = Math.max(0, dx);
    setReaderOffset(state.dx, 'none');
  }
  function onTouchEnd() {
    const state = swipe.current;
    swipe.current = null;
    if (!state?.dragging) return;
    const width = readerRef.current?.offsetWidth || window.innerWidth;
    const speed = state.dx / Math.max(1, Date.now() - state.time);
    if (state.dx > width / 3 || (speed > 0.5 && state.dx > 40)) {
      // The slide-out animation continues from where the finger let go (see data-closing in the CSS).
      setClosing(true);
      closeTimer.current = setTimeout(onClose, SLIDE_OUT_MS);
    } else {
      setReaderOffset(0, `transform ${DRAG_FINISH_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`);
    }
  }

  // A recipe shows only the recipe: no summary, author, date or reading time.
  const isRecipe = content.status === 'ready' && content.recipe;
  const meta = isRecipe
    ? [domain]
    : [
        domain,
        link.byline,
        link.publishedAt && formatPublished(link.publishedAt),
        link.readingMinutes && `${link.readingMinutes} min. leestijd`,
      ].filter(Boolean);
  // Waits for the article, so a recipe's summary doesn't flash by first.
  const showSummary = link.summary && content.status !== 'loading' && !isRecipe;
  const html = useMemo(
    () => (content.status !== 'ready' ? '' : content.recipe ? withIngredientTable(content.html) : content.html),
    [content],
  );
  const notes = link.notes;

  // Colours the highlights in the article text; again whenever they or the article change.
  useEffect(() => {
    if (bodyRef.current) applyHighlights(bodyRef.current, link.highlights ?? []);
  }, [html, link.highlights]);

  return (
    <div
      className={styles.reader}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-title"
      ref={readerRef}
      data-reader
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      {...settingsAttributes(settings)}
      data-closing={closing || undefined}
    >
      <div className={styles.bar}>
        <button ref={backButton} className={styles.barIcon} onClick={slideOut} aria-label="Terug" title="Terug">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={styles.barActions}>
          <button
            ref={settingsButton}
            className={styles.barIcon}
            onClick={() => setSheet('settings')}
            aria-label="Weergave"
            title="Weergave"
            aria-expanded={sheet === 'settings'}
          >
            <span className={styles.barText} aria-hidden="true">
              Aa
            </span>
          </button>
          <button
            ref={noteButton}
            className={styles.barIcon}
            onClick={() => setSheet('note')}
            aria-label="Notitie toevoegen"
            title="Notitie toevoegen"
            aria-expanded={sheet === 'note'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
          <a
            className={styles.barIcon}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Origineel openen"
            title="Origineel openen"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 4h6v6" />
              <path d="M20 4l-9 9" />
              <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
            </svg>
          </a>
          {actions}
        </div>
      </div>
      <article className={styles.article} onClick={onArticleClick}>
        {labels && <div className={styles.labels}>{labels}</div>}
        <h1 id="reader-title" className={styles.title}>
          {link.title ?? domain}
        </h1>
        <p className={styles.meta}>{meta.join(' · ')}</p>
        {showSummary && <p className={styles.summary}>{link.summary}</p>}
        {notes.length > 0 && (
          <section className={styles.notes} aria-labelledby="reader-notes-title">
            <h2 id="reader-notes-title" className={styles.notesTitle}>
              {notes.length === 1 ? 'Notitie' : `Notities (${notes.length})`}
            </h2>
            <ul className={styles.noteList}>
              {notes.map((note) => (
                <li key={note.id} className={styles.note}>
                  <p className={styles.noteText}>{note.text}</p>
                  <div className={styles.noteFooter}>
                    <time dateTime={note.createdAt}>{formatNoteDate(note.createdAt)}</time>
                    <button
                      className={styles.noteDelete}
                      onClick={() => deleteNote(note)}
                      disabled={deletingNoteId === note.id}
                    >
                      Verwijder
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {content.status === 'loading' && (
          <p className={styles.status}>
            <span className={styles.spinner} aria-hidden="true" />
            Artikel laden...
          </p>
        )}
        {content.status === 'failed' && (
          <p className={styles.status}>
            Het artikel kon niet geladen worden.{' '}
            <a href={link.url} target="_blank" rel="noreferrer">
              Open het origineel
            </a>
          </p>
        )}
        {content.status === 'ready' && (
          // Sanitized on the server when it was saved (lib/articleHtml.ts).
          <div ref={bodyRef} className={styles.body} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </article>
      {(passage ?? activeMark) && (
        <div
          className={styles.passageBar}
          style={passage ? { top: passage.top, left: passage.left } : { top: activeMark!.top, left: activeMark!.left }}
        >
          {passage && !passage.insideId ? (
            <button
              className={styles.passageButton}
              disabled={savingHighlight}
              // Keeps the selection while tapping (desktop browsers clear it on mousedown).
              onPointerDown={(event) => event.preventDefault()}
              onClick={addHighlight}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11l-5 5v4h4l5-5" />
                <path d="M15 5l4 4-8 8-4-4z" />
              </svg>
              Highlight
            </button>
          ) : (
            <button
              className={styles.passageButton}
              disabled={savingHighlight}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => removeHighlight(passage?.insideId ?? activeMark!.id)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11l-5 5v4h4l5-5" />
                <path d="M15 5l4 4-8 8-4-4z" />
                <path d="M3 3l18 18" />
              </svg>
              Highlight weg
            </button>
          )}
        </div>
      )}
      {sheet === 'settings' && <ReaderSettingsSheet settings={settings} onChange={changeSettings} onClose={closeSheet} />}
      {sheet === 'note' && (
        <NoteSheet
          linkId={link.id}
          onSaved={(updated) => {
            onChange?.(updated);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

// Bottom sheet with a text field for a new note.
function NoteSheet({
  linkId,
  onSaved,
  onClose,
}: {
  linkId: string;
  onSaved: (link: LinkRow) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/links/${linkId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError('Bewaren mislukt, probeer het opnieuw');
        return;
      }
      onSaved(await res.json());
    } catch {
      setError('Geen verbinding, probeer het opnieuw');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.settingsBackdrop} onClick={onClose}>
      <form
        className={styles.settingsSheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-note-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={save}
      >
        <div className={styles.settingsHeader}>
          <button type="button" className={styles.settingsCancel} onClick={onClose}>
            Annuleer
          </button>
          <h2 id="reader-note-title" className={styles.settingsTitle}>
            Notitie
          </h2>
          <button type="submit" className={styles.settingsDone} disabled={saving || !text.trim()}>
            Bewaar
          </button>
        </div>
        <div className={styles.settingsScroll}>
          <textarea
            className={styles.noteInput}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Schrijf een notitie bij dit artikel"
            aria-label="Notitie"
            maxLength={2000}
            rows={5}
            autoFocus
          />
          {error && (
            <p className={styles.noteError} role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
