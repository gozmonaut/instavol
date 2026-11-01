'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type TouchEvent } from 'react';
import { splitIngredient } from '@/lib/recipe';
import type { LinkNote, LinkRow } from '@/lib/schema';
import styles from './Reader.module.css';
import { ReaderSettingsSheet, loadSettings, saveSettings, settingsAttributes, type ReaderSettings } from './ReaderSettings';

type ContentState = { status: 'loading' } | { status: 'ready'; html: string; recipe: boolean } | { status: 'failed' };

type Sheet = 'settings' | 'note' | null;

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

  // A swipe to the right goes back to the overview, like the back button. Mostly-horizontal
  // swipes only, and not from inside something that scrolls sideways (wide tables, code).
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    swipeStart.current = null;
    if (event.touches.length !== 1 || sheetRef.current) return;
    for (let el = event.target as HTMLElement | null; el && el !== event.currentTarget; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX !== 'visible') return;
    }
    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  }
  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || sheetRef.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx > 80 && dx > Math.abs(dy) * 2) onClose();
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

  return (
    <div
      className={styles.reader}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-title"
      data-reader
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      {...settingsAttributes(settings)}
    >
      <div className={styles.bar}>
        <button ref={backButton} className={styles.barIcon} onClick={onClose} aria-label="Terug" title="Terug">
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
      <article className={styles.article}>
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
          <div className={styles.body} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </article>
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
