'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { LinkRow } from '@/lib/schema';
import { RESEARCH_FOCUSES, buildResearchPrompt, type ResearchFocus } from '@/lib/researchPrompt';
import { parseShareUrl } from '@/lib/shareUrl';
import styles from './LinksBrowser.module.css';

const SEARCH_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const COPIED_FEEDBACK_MS = 2000;

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
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const topSentinel = useRef<HTMLDivElement>(null);

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

  return (
    <main className={styles.page} data-compact={compact}>
      <div ref={topSentinel} className={styles.sentinel} aria-hidden="true" />
      <div className={styles.brand}>
        <h1>
          <picture>
            <source srcSet="/instavol-logo-dark.svg" media="(prefers-color-scheme: dark)" />
            <img src="/instavol-logo-light.svg" alt="Instavol" className={styles.logo} />
          </picture>
        </h1>
        <button className={styles.iconButton} onClick={handleLogout} aria-label="Uitloggen" title="Uitloggen">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
            <path d="M10 17l-5-5 5-5" />
            <path d="M5 12h11" />
          </svg>
        </button>
      </div>
      <header className={styles.header}>
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
        <ul className={styles.list}>
          {links.map((link) => (
            <li key={link.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <a href={link.url} target="_blank" rel="noreferrer" className={styles.cardTitle}>
                  {link.title ?? link.url}
                </a>
                {link.category && <span className={styles.chip}>{link.category}</span>}
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
                  Onderzoek met Claude
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
