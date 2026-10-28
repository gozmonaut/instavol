'use client';

import { useEffect, useRef, useState } from 'react';
import type { LinkRow } from '@/lib/schema';
import { parseShareUrl } from '@/lib/shareUrl';
import styles from './LinksBrowser.module.css';

const SEARCH_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

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

function distinctCategories(items: LinkRow[]): string[] {
  const categories = new Set<string>();
  for (const item of items) {
    if (item.category) categories.add(item.category);
  }
  return Array.from(categories).sort();
}

export default function LinksBrowser({ initialLinks }: { initialLinks: LinkRow[] }) {
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <picture>
            <source srcSet="/instavol-logo-dark.svg" media="(prefers-color-scheme: dark)" />
            <img src="/instavol-logo-light.svg" alt="Instavol" className={styles.logo} />
          </picture>
        </h1>
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
