'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import AuthPage from '@/app/login/AuthPage';
import styles from '@/app/login/login.module.css';
import { authClient } from '@/lib/auth/client';
import { authOutcome, failureMessage } from '@/lib/auth/outcome';

export default function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const outcome = await authOutcome(() =>
      authClient.requestPasswordReset({ email, redirectTo: '/wachtwoord-herstellen' }),
    );
    setSubmitting(false);
    // A refusal (for example an unknown address) looks the same as success, so this form
    // can't be used to find out who has an account.
    if (outcome === 'offline' || outcome === 'unavailable') setError(failureMessage(outcome));
    else setSent(true);
  }

  return (
    <AuthPage>
      {sent ? (
        <div className={styles.form}>
          <p className={styles.notice}>
            Als dit adres bij ons bekend is, staat er een mail met een herstellink in je inbox. De link is 15 minuten
            geldig.
          </p>
          <p className={styles.links}>
            <Link href="/login">Terug naar inloggen</Link>
          </p>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          <p className={styles.notice}>Vul je e-mailadres in. Je krijgt een mail met een link om een nieuw wachtwoord te kiezen.</p>
          <div className={styles.group}>
            <input
              className={styles.field}
              type="email"
              aria-label="E-mailadres"
              placeholder="E-mailadres"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {error && (
            <p key={error + String(submitting)} role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? 'Bezig…' : 'Stuur herstellink'}
          </button>

          <p className={styles.links}>
            <Link href="/login">Terug naar inloggen</Link>
          </p>
        </form>
      )}
    </AuthPage>
  );
}
