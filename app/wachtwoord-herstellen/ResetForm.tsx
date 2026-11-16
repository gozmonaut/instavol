'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import AuthPage from '@/app/login/AuthPage';
import styles from '@/app/login/login.module.css';
import { authClient } from '@/lib/auth/client';
import { authOutcome, failureMessage } from '@/lib/auth/outcome';

const MIN_PASSWORD_LENGTH = 8;

// Where the link from the reset mail lands; `token` comes from that link.
export default function ResetForm({ token }: { token?: string }) {
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [expired, setExpired] = useState(!token);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== repeatPassword) {
      setError('De wachtwoorden zijn niet gelijk');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Wachtwoord moet minstens ${MIN_PASSWORD_LENGTH} tekens zijn`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const outcome = await authOutcome(() => authClient.resetPassword({ newPassword, token: token! }));
    setSubmitting(false);
    if (outcome === 'ok') setDone(true);
    else if (outcome === 'rejected') setExpired(true);
    else setError(failureMessage(outcome));
  }

  if (done) {
    return (
      <AuthPage>
        <div className={styles.form}>
          <p className={styles.notice}>Je wachtwoord is gewijzigd. Log nu in met je nieuwe wachtwoord.</p>
          <p className={styles.links}>
            <Link href="/login">Inloggen</Link>
          </p>
        </div>
      </AuthPage>
    );
  }

  if (expired) {
    return (
      <AuthPage>
        <div className={styles.form}>
          <p className={styles.notice}>Deze link is verlopen. Vraag een nieuwe aan.</p>
          <p className={styles.links}>
            <Link href="/wachtwoord-vergeten">Nieuwe link aanvragen</Link>
          </p>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      {/* noValidate: the checks above give the messages, in the app's own style */}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.group}>
          <input
            className={styles.field}
            type="password"
            aria-label="Nieuw wachtwoord"
            placeholder="Nieuw wachtwoord (minstens 8 tekens)"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <input
            className={styles.field}
            type="password"
            aria-label="Herhaal nieuw wachtwoord"
            placeholder="Herhaal nieuw wachtwoord"
            autoComplete="new-password"
            required
            value={repeatPassword}
            onChange={(event) => setRepeatPassword(event.target.value)}
          />
        </div>

        {error && (
          <p key={error + String(submitting)} role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Bezig…' : 'Wachtwoord opslaan'}
        </button>
      </form>
    </AuthPage>
  );
}
