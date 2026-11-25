'use client';

import { useState } from 'react';
import AuthPage from '@/app/login/AuthPage';
import styles from '@/app/login/login.module.css';

export const PAIR_MESSAGE_TYPE = 'instavol-extension-token';

// Opened by the Safari extension. A click makes the extension's own token and hands it to the extension's
// content script on this page (window.postMessage); the token is never shown or stored here.
export default function PairExtension() {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function pair() {
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/extension-token', { method: 'POST' });
      if (!response.ok) throw new Error();
      const { token } = (await response.json()) as { token: string };
      window.postMessage({ type: PAIR_MESSAGE_TYPE, token }, window.location.origin);
      setState('done');
    } catch {
      setError('Koppelen is niet gelukt, probeer het opnieuw');
      setState('idle');
    }
  }

  return (
    <AuthPage>
      <div className={styles.form}>
        {state === 'done' ? (
          <p className={styles.notice} role="status">
            Gekoppeld. Je kunt dit tabblad sluiten en de extensie gebruiken.
          </p>
        ) : (
          <>
            <p className={styles.notice}>
              Koppel de Safari-extensie aan je account. Een eerder gekoppelde extensie werkt daarna niet meer.
            </p>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <button type="button" className={styles.submit} disabled={state === 'busy'} onClick={pair}>
              {state === 'busy' ? 'Bezig…' : 'Koppel extensie'}
            </button>
          </>
        )}
      </div>
    </AuthPage>
  );
}
