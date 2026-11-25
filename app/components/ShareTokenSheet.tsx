'use client';

import { useEffect, useState } from 'react';
import styles from './LinksBrowser.module.css';

// The personal token that the share-menu shortcut uses to save into this account.
// Only a new token can be shown: the server keeps just a hash of it.
export default function ShareTokenSheet({ onClose }: { onClose: () => void }) {
  const [exists, setExists] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The sheet only opens after a click, so it is never rendered on the server.
  const origin = window.location.origin;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/share-token')
      .then((res) => (res.ok ? res.json() : { exists: false }))
      .then((data) => {
        if (!cancelled) setExists(Boolean(data.exists));
      })
      .catch(() => {
        if (!cancelled) setExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function createToken() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/share-token', { method: 'POST' });
      const data = res.ok ? await res.json() : null;
      if (typeof data?.token !== 'string') throw new Error('no token');
      setToken(data.token);
      setCopied(false);
      setExists(true);
    } catch {
      setError('Token maken is niet gelukt, probeer het opnieuw');
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setError('Kopiëren is niet gelukt; selecteer het token en kopieer het zelf');
    }
  }

  return (
    <div className={styles.dialogBackdrop} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-token-title"
        className={`${styles.dialog} ${styles.dialogWide}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogBody}>
          <p id="share-token-title" className={styles.dialogTitle}>
            Token voor opslaan-snelkoppeling
          </p>
          <p className={styles.dialogText}>
            Met dit token slaat de snelkoppeling in het deelmenu links op in jouw account.
            {exists && !token && ' Het oude token werkt daarna niet meer.'}
          </p>
        </div>
        <div className={styles.dialogBody}>
          <p className={styles.dialogTitle}>Instellen op iPhone</p>
          <p className={styles.dialogText}>1. Maak hierboven een token en kopieer het.</p>
          <p className={styles.dialogText}>
            2. Open de Opdrachten-app en maak een nieuwe opdracht. Zet in de instellingen &ldquo;Toon in deelmenu&rdquo; aan
            en kies URL&rsquo;s, tekst en afbeeldingen.
          </p>
          <p className={styles.dialogText}>
            3. Voeg &ldquo;Haal inhoud van URL op&rdquo; toe: methode POST naar {origin}/api/share, header
            Authorization met &ldquo;Bearer&rdquo; en je token. Body JSON met url (of text voor losse tekst). Voor een
            afbeelding: eerst formaat wijzigen (breedte 2000), dan body Formulier met het veld file.
          </p>
          <p className={styles.dialogText}>4. Deel een pagina vanuit Safari om te testen.</p>
        </div>
        {token && (
          <div className={styles.passwordBody}>
            <code className={styles.tokenValue}>{token}</code>
            <p className={styles.dialogText}>Je ziet dit token maar één keer.</p>
          </div>
        )}
        {error && (
          <p className={styles.passwordError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogButton} onClick={onClose}>
            Sluiten
          </button>
          {token ? (
            <button type="button" className={styles.dialogButton} onClick={copyToken}>
              {copied ? 'Gekopieerd' : 'Kopieer'}
            </button>
          ) : (
            exists !== null && (
              <button type="button" className={styles.dialogButton} onClick={createToken} disabled={busy}>
                {exists ? 'Token vervangen' : 'Token maken'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
