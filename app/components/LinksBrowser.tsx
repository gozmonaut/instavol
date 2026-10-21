'use client';

import { useEffect, useRef, useState } from 'react';
import type { LinkRow } from '@/lib/schema';

const SEARCH_DEBOUNCE_MS = 300;

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

  const categories = distinctCategories(links);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '1rem' }}>Instavol</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          type="search"
          placeholder="Zoeken..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          style={{ padding: '0.5rem' }}
        >
          <option value="">Alle categorieën</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {links.map((link) => (
          <li
            key={link.id}
            style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <a href={link.url} target="_blank" rel="noreferrer" style={{ fontWeight: 'bold' }}>
                {link.title ?? link.url}
              </a>
              {link.category && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    background: '#eee',
                    borderRadius: 4,
                    padding: '0.1rem 0.5rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {link.category}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
              {domainFromUrl(link.url)} · {formatDate(link.createdAt)}
            </div>
            {link.status === 'done' && link.summary && (
              <p style={{ marginTop: '0.5rem' }}>{link.summary}</p>
            )}
            {link.status === 'pending' && <p style={{ marginTop: '0.5rem' }}>Wordt verwerkt...</p>}
            {link.status === 'failed' && (
              <p style={{ marginTop: '0.5rem' }}>Mislukt: {link.errorMessage}</p>
            )}
            {link.status !== 'done' && (
              <button
                onClick={() => handleRetry(link.id)}
                disabled={retryingId === link.id}
                style={{ marginTop: '0.5rem' }}
              >
                Opnieuw verwerken
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
