'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { LinkRow } from '@/lib/schema';
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

  async function handleShare(link: LinkRow) {
    const text = buildShareText(link);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // User closed the share sheet; nothing to do.
      }
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), COPIED_FEEDBACK_MS);
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
              <a href={link.url} target="_blank" rel="noreferrer" className={styles.cardTitle}>
                {link.title ?? link.url}
              </a>
              <div className={styles.meta}>
                <span>{domainFromUrl(link.url)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDate(link.createdAt)}</span>
                {link.category && <span className={styles.chip}>{link.category}</span>}
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
                  {copiedId === link.id ? 'Gekopieerd' : 'Delen'}
                </button>
                {link.status !== 'done' && (
                  <button
                    className={styles.action}
                    onClick={() => handleRetry(link.id)}
                    disabled={retryingId === link.id}
                  >
                    Opnieuw verwerken
                  </button>
                )}
                <button
                  className={`${styles.action} ${styles.danger}`}
                  onClick={() => handleDelete(link.id)}
                  disabled={deletingId === link.id}
                >
                  Verwijderen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
