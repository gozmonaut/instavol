'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LinkRow } from '@/lib/schema';
import styles from './Reader.module.css';
import { ReaderSettingsSheet, loadSettings, saveSettings, settingsAttributes, type ReaderSettings } from './ReaderSettings';

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
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  function changeSettings(next: ReaderSettings) {
    setSettings(next);
    saveSettings(next);
  }

  function closeSettings() {
    setSettingsOpen(false);
    settingsButton.current?.focus({ focusVisible: false } as FocusOptions);
  }

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

  // The list behind stays put while reading; Escape closes the settings first, then goes back.
  useEffect(() => {
    // Focus for keyboard and screen readers, without drawing a focus ring after a tap.
    backButton.current?.focus({ focusVisible: false } as FocusOptions);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (settingsOpenRef.current) {
        setSettingsOpen(false);
        settingsButton.current?.focus({ focusVisible: false } as FocusOptions);
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

  const meta = [
    domain,
    link.byline,
    link.publishedAt && formatPublished(link.publishedAt),
    link.readingMinutes && `${link.readingMinutes} min. leestijd`,
  ].filter(Boolean);

  return (
    <div
      className={styles.reader}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-title"
      data-reader
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
            onClick={() => setSettingsOpen(true)}
            aria-label="Weergave"
            title="Weergave"
            aria-expanded={settingsOpen}
          >
            <span className={styles.barText} aria-hidden="true">
              Aa
            </span>
          </button>
          {actions}
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
      {settingsOpen && <ReaderSettingsSheet settings={settings} onChange={changeSettings} onClose={closeSettings} />}
    </div>
  );
}
