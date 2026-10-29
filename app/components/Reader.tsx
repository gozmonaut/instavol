'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LinkRow } from '@/lib/schema';
import styles from './Reader.module.css';

type ContentState = { status: 'loading' } | { status: 'ready'; html: string } | { status: 'failed' };

function formatPublished(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(date);
}

// Full-screen reader for the saved article text, sliding in like an iOS navigation push.
// `actions` are the item's buttons (share, research, delete), shown in the top bar.
export default function Reader({
  link,
  domain,
  actions,
  onClose,
}: {
  link: LinkRow;
  domain: string;
  actions: ReactNode;
  onClose: () => void;
}) {
  const [content, setContent] = useState<ContentState>({ status: 'loading' });
  const backButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/links/${link.id}/content`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { html: string }) => {
        if (!cancelled) setContent({ status: 'ready', html: data.html });
      })
      .catch(() => {
        if (!cancelled) setContent({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [link.id]);

  // The list behind stays put while reading; Escape goes back.
  useEffect(() => {
    backButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const meta = [
    domain,
    link.byline,
    link.publishedAt && formatPublished(link.publishedAt),
    link.readingMinutes && `${link.readingMinutes} min. leestijd`,
  ].filter(Boolean);

  return (
    <div className={styles.reader} role="dialog" aria-modal="true" aria-labelledby="reader-title" data-reader>
      <div className={styles.bar}>
        <button ref={backButton} className={styles.barButton} onClick={onClose}>
          <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
            <path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Terug
        </button>
        <div className={styles.barActions}>
          {actions}
          <a className={styles.barButton} href={link.url} target="_blank" rel="noreferrer">
            Origineel
          </a>
        </div>
      </div>
      <article className={styles.article}>
        <h1 id="reader-title" className={styles.title}>
          {link.title ?? domain}
        </h1>
        <p className={styles.meta}>{meta.join(' · ')}</p>
        {link.summary && <p className={styles.summary}>{link.summary}</p>}
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
          <div className={styles.body} dangerouslySetInnerHTML={{ __html: content.html }} />
        )}
      </article>
    </div>
  );
}
