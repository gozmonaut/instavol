'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LinkRow } from '@/lib/schema';
import { groupByDate } from '@/lib/dateGroups';
import { RESEARCH_FOCUSES, buildResearchPrompt, type ResearchFocus } from '@/lib/researchPrompt';
import { parseShareUrl } from '@/lib/shareUrl';
import styles from './LinksBrowser.module.css';

const SEARCH_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const COPIED_FEEDBACK_MS = 2000;
const PULL_THRESHOLD_PX = 70;
const PULL_RESISTANCE = 0.5;

// Safari has its own pull-to-refresh; a home-screen web app (standalone) has none.
function isStandalone(): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// The URL goes inside the text: some apps keep only the text or only the url when both are passed.
function buildShareText(link: LinkRow): string {
  const meta = [formatDate(link.createdAt), link.category].filter(Boolean).join(' | ');
  const summary = link.status === 'done' && link.summary ? link.summary : null;
  return [link.title, meta, summary, link.url].filter(Boolean).join('\n');
}

const ACTION_ICON_PATHS = {
  share: ['M12 15V4', 'M8 8l4-4 4 4', 'M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1'],
  research: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'],
  retry: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4'],
  delete: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
} as const;

function ActionIcon({ name }: { name: keyof typeof ACTION_ICON_PATHS }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ACTION_ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function distinctCategories(items: LinkRow[]): string[] {
  const categories = new Set<string>();
  for (const item of items) {
    if (item.category) categories.add(item.category);
  }
  return Array.from(categories).sort();
}

export default function LinksBrowser({ initialLinks }: { initialLinks: LinkRow[] }) {
  const router = useRouter();
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [researchLink, setResearchLink] = useState<LinkRow | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [categoryMenuLink, setCategoryMenuLink] = useState<LinkRow | null>(null);
  const [editingLink, setEditingLink] = useState<LinkRow | null>(null);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const topSentinel = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Date headings stick right below the search header, whose height can change (e.g. the Enter hint).
  useEffect(() => {
    const page = pageRef.current;
    const header = headerRef.current;
    if (!page || !header || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      page.style.setProperty('--header-height', `${header.offsetHeight}px`);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Compact header (logo hidden) once the top of the page has scrolled out of view.
  useEffect(() => {
    const sentinel = topSentinel.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      fetch(`/api/links?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setLinks(data.links));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q, category]);

  // Pull-to-refresh for the home-screen app. The pull distance is written straight to the
  // indicator's style, so dragging doesn't re-render the whole list on every touchmove.
  const pullIndicatorRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshLinks = useCallback(() => {
    setRefreshing(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    fetch(`/api/links?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setLinks(data.links))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [q, category]);

  useEffect(() => {
    if (!isStandalone()) return;

    let startY: number | null = null;
    let distance = 0;

    function showPull(px: number) {
      const indicator = pullIndicatorRef.current;
      if (!indicator) return;
      indicator.style.setProperty('--pull', String(px));
      indicator.dataset.ready = String(px >= PULL_THRESHOLD_PX);
    }

    function onTouchStart(event: TouchEvent) {
      const inSheet = event.target instanceof Element && event.target.closest(`.${styles.sheetBackdrop}`);
      if (window.scrollY > 0 || event.touches.length !== 1 || inSheet) return;
      startY = event.touches[0].clientY;
      distance = 0;
    }

    function onTouchMove(event: TouchEvent) {
      if (startY === null) return;
      const dy = event.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        startY = null;
        showPull(0);
        return;
      }
      // Stop the rubber-band bounce so only the indicator moves.
      event.preventDefault();
      distance = dy * PULL_RESISTANCE;
      showPull(distance);
    }

    function onTouchEnd() {
      if (startY === null) return;
      startY = null;
      showPull(0);
      if (distance >= PULL_THRESHOLD_PX) refreshLinks();
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [refreshLinks]);

  // Refresh while items are being processed, so title/summary appear without a reload.
  const hasPending = links.some((link) => link.status === 'pending');
  useEffect(() => {
    if (!hasPending) return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        return;
      }
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      fetch(`/api/links?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setLinks(data.links));
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hasPending, q, category]);

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/links/${id}/reprocess`, { method: 'POST' });
      const updated = await res.json();
      setLinks((prev) => prev.map((link) => (link.id === id ? updated : link)));
    } finally {
      setRetryingId(null);
    }
  }

  async function handleSave(url: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const created: LinkRow = await res.json();
        setLinks((prev) => [created, ...prev]);
        setQ('');
      }
    } finally {
      setSaving(false);
    }
  }

  // Opens the native share sheet, or copies the text where sharing isn't supported.
  async function shareOrCopy(
    text: string,
    id: string,
    setFeedbackId: (update: (current: string | null) => string | null) => void,
  ) {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // User closed the share sheet; nothing to do.
      }
      return;
    }
    await navigator.clipboard.writeText(text);
    setFeedbackId(() => id);
    setTimeout(() => setFeedbackId((current) => (current === id ? null : current)), COPIED_FEEDBACK_MS);
  }

  function handleShare(link: LinkRow) {
    return shareOrCopy(buildShareText(link), link.id, setCopiedId);
  }

  function handleResearch(focus: ResearchFocus) {
    if (!researchLink) return;
    const link = researchLink;
    setResearchLink(null);
    return shareOrCopy(buildResearchPrompt(link, focus, formatDate(link.createdAt)), link.id, setPromptCopiedId);
  }

  function toggleCategoryFilter(link: LinkRow) {
    setCategoryMenuLink(null);
    setCategory((current) => (current === link.category ? '' : (link.category ?? '')));
  }

  function startEditingCategory(link: LinkRow) {
    setCategoryMenuLink(null);
    setEditingLink(link);
    setCategoryDraft(link.category ?? '');
    // The filtered list may not contain every category, so ask the server for all of them.
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setAllCategories(data.categories))
      .catch(() => setAllCategories(distinctCategories(links)));
  }

  async function saveCategory(value: string) {
    if (!editingLink || !value.trim() || savingCategory) return;
    setSavingCategory(true);
    try {
      const res = await fetch(`/api/links/${editingLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: value.trim() }),
      });
      if (res.ok) {
        const updated: LinkRow = await res.json();
        setLinks((prev) => prev.map((link) => (link.id === updated.id ? updated : link)));
        setEditingLink(null);
      }
    } finally {
      setSavingCategory(false);
    }
  }

  function jumpToGroup(label: string) {
    setGroupPickerOpen(false);
    const section = pageRef.current?.querySelector<HTMLElement>(`section[data-group="${CSS.escape(label)}"]`);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  async function handleLogout() {
    if (!window.confirm('Weet je zeker dat je wilt uitloggen?')) return;
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Weet je zeker dat je dit item wilt verwijderen?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/links/${id}`, { method: 'DELETE' });
      if (res.ok) setLinks((prev) => prev.filter((link) => link.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const categories = distinctCategories(links);
  const isFiltering = Boolean(q || category);
  const groups = groupByDate(links);

  return (
    <main ref={pageRef} className={styles.page} data-compact={compact}>
      <div ref={topSentinel} className={styles.sentinel} aria-hidden="true" />
      <div ref={pullIndicatorRef} className={styles.pullIndicator} data-refreshing={refreshing} role="status" aria-label={refreshing ? 'Verversen' : undefined}>
        <span className={styles.spinner} aria-hidden="true" />
      </div>
      <div className={styles.brand}>
        <h1>
          <picture>
            <source srcSet="/instavol-logo-dark.svg" media="(prefers-color-scheme: dark)" />
            <img src="/instavol-logo-light.svg" alt="Instavol" className={styles.logo} />
          </picture>
        </h1>
        <div className={styles.brandActions}>
          <button className={styles.iconButton} onClick={refreshLinks} disabled={refreshing} aria-label="Verversen" title="Verversen">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v4h-4" />
            </svg>
          </button>
          <button className={styles.iconButton} onClick={handleLogout} aria-label="Uitloggen" title="Uitloggen">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
              <path d="M10 17l-5-5 5-5" />
              <path d="M5 12h11" />
            </svg>
          </button>
        </div>
      </div>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.controls}>
          <input
            type="search"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Zoek of plak een link"
            placeholder="Zoek of plak een link"
            className={styles.search}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              const url = parseShareUrl(q);
              if (event.key === 'Enter' && url && !saving) handleSave(url);
            }}
          />
          <select
            aria-label="Categorie"
            className={styles.select}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Alles</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {parseShareUrl(q) && <p className={styles.hint}>Druk op Enter om deze link te bewaren</p>}
      </header>

      {links.length === 0 ? (
        <div className={styles.empty}>
          {isFiltering ? (
            <p className={styles.emptyTitle}>Geen resultaten</p>
          ) : (
            <>
              <p className={styles.emptyTitle}>Nog niets bewaard</p>
              <p>Plak hierboven een link, of deel een pagina vanuit Safari met &ldquo;Bewaar in Instavol&rdquo;.</p>
            </>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className={styles.group} data-group={group.label}>
            <h2 className={styles.groupHeading}>
              <button
                className={styles.groupButton}
                aria-label={`${group.label}, kies een periode`}
                aria-haspopup="dialog"
                onClick={() => setGroupPickerOpen(true)}
              >
                {group.label}
                <svg width="10" height="10" viewBox="0 0 12 8" aria-hidden="true">
                  <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </h2>
            <ul className={styles.list}>
              {group.items.map((link) => (
                <li key={link.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <a href={link.url} target="_blank" rel="noreferrer" className={styles.cardTitle}>
                      {link.title ?? link.url}
                    </a>
                    {link.category && (
                      <button
                        className={styles.chip}
                        aria-label={`Categorie ${link.category}`}
                        aria-haspopup="dialog"
                        aria-pressed={category === link.category}
                        onClick={() => setCategoryMenuLink(link)}
                      >
                        {link.category}
                      </button>
                    )}
                  </div>
                  <div className={styles.meta}>
                    <span>{domainFromUrl(link.url)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(link.createdAt)}</span>
                  </div>
                  {link.status === 'done' && link.summary && <p className={styles.summary}>{link.summary}</p>}
                  {link.status === 'pending' && (
                    <p className={styles.status}>
                      <span className={styles.spinner} aria-hidden="true" />
                      Wordt verwerkt...
                    </p>
                  )}
                  {link.status === 'failed' && (
                    <p className={`${styles.status} ${styles.failed}`}>Mislukt: {link.errorMessage}</p>
                  )}
                  <div className={styles.actions}>
                    <button className={styles.action} onClick={() => handleShare(link)}>
                      <ActionIcon name="share" />
                      {copiedId === link.id ? 'Gekopieerd' : 'Delen'}
                    </button>
                    <button className={styles.action} onClick={() => setResearchLink(link)}>
                      <ActionIcon name="research" />
                      {promptCopiedId === link.id ? 'Gekopieerd' : 'Onderzoek'}
                    </button>
                    {link.status !== 'done' && (
                      <button
                        className={styles.action}
                        onClick={() => handleRetry(link.id)}
                        disabled={retryingId === link.id}
                        aria-label="Opnieuw verwerken"
                      >
                        <ActionIcon name="retry" />
                        Opnieuw
                      </button>
                    )}
                    <button
                      className={`${styles.action} ${styles.danger}`}
                      onClick={() => handleDelete(link.id)}
                      disabled={deletingId === link.id}
                    >
                      <ActionIcon name="delete" />
                      Verwijderen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {categoryMenuLink && (
        <div className={styles.sheetBackdrop} onClick={() => setCategoryMenuLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-menu-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetGroup}>
              <div className={styles.sheetHeader}>
                <p id="category-menu-title" className={styles.sheetTitle}>
                  {categoryMenuLink.category}
                </p>
              </div>
              <button className={styles.sheetOption} onClick={() => toggleCategoryFilter(categoryMenuLink)}>
                {category === categoryMenuLink.category ? 'Toon alle categorieën' : `Filter op ${categoryMenuLink.category}`}
              </button>
              <button className={styles.sheetOption} onClick={() => startEditingCategory(categoryMenuLink)}>
                Categorie wijzigen
              </button>
            </div>
            <button className={styles.sheetCancel} onClick={() => setCategoryMenuLink(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {editingLink && (
        <div className={styles.sheetBackdrop} onClick={() => setEditingLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-edit-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${styles.sheetGroup} ${styles.sheetScroll}`}>
              <div className={styles.sheetHeader}>
                <p id="category-edit-title" className={styles.sheetTitle}>
                  Categorie wijzigen
                </p>
                <p className={styles.sheetSubtitle}>{editingLink.title ?? domainFromUrl(editingLink.url)}</p>
              </div>
              <form
                className={styles.sheetForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  saveCategory(categoryDraft);
                }}
              >
                <input
                  className={styles.sheetInput}
                  aria-label="Nieuwe categorie"
                  placeholder="Nieuwe categorie"
                  enterKeyHint="done"
                  autoCapitalize="sentences"
                  value={categoryDraft}
                  onChange={(event) => setCategoryDraft(event.target.value)}
                />
                <button type="submit" className={styles.sheetSave} disabled={!categoryDraft.trim() || savingCategory}>
                  Bewaar
                </button>
              </form>
              {allCategories
                .filter((c) => c !== editingLink.category)
                .map((c) => (
                  <button key={c} className={styles.sheetOption} disabled={savingCategory} onClick={() => saveCategory(c)}>
                    {c}
                  </button>
                ))}
            </div>
            <button className={styles.sheetCancel} onClick={() => setEditingLink(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {groupPickerOpen && (
        <div className={styles.sheetBackdrop} onClick={() => setGroupPickerOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-picker-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${styles.sheetGroup} ${styles.sheetScroll}`}>
              <div className={styles.sheetHeader}>
                <p id="group-picker-title" className={styles.sheetTitle}>
                  Ga naar
                </p>
              </div>
              {groups.map((group) => (
                <button
                  key={group.label}
                  className={styles.sheetOption}
                  aria-label={`${group.label} (${group.items.length})`}
                  onClick={() => jumpToGroup(group.label)}
                >
                  {group.label}
                  <span className={styles.sheetCount}>{group.items.length}</span>
                </button>
              ))}
            </div>
            <button className={styles.sheetCancel} onClick={() => setGroupPickerOpen(false)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {researchLink && (
        <div className={styles.sheetBackdrop} onClick={() => setResearchLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="research-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetGroup}>
              <div className={styles.sheetHeader}>
                <p id="research-title" className={styles.sheetTitle}>
                  Onderzoek met AI
                </p>
                <p className={styles.sheetSubtitle}>{researchLink.title ?? domainFromUrl(researchLink.url)}</p>
              </div>
              {RESEARCH_FOCUSES.map((focus) => (
                <button key={focus.id} className={styles.sheetOption} onClick={() => handleResearch(focus.id)}>
                  {focus.label}
                </button>
              ))}
            </div>
            <button className={styles.sheetCancel} onClick={() => setResearchLink(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
