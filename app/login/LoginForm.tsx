'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth/client';
import { authOutcome, failureMessage } from '@/lib/auth/outcome';
import AuthPage from './AuthPage';
import styles from './login.module.css';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const outcome = await authOutcome(() => authClient.signIn.email({ email, password }));
    setSubmitting(false);
    if (outcome === 'ok') {
      router.replace('/');
    } else if (outcome === 'rejected') {
      setError('Onjuist e-mailadres of wachtwoord');
      setPassword('');
    } else {
      setError(failureMessage(outcome));
    }
  }

  return (
    <AuthPage>
      <form className={styles.form} onSubmit={handleSubmit}>
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
          <input
            className={styles.field}
            type="password"
            aria-label="Wachtwoord"
            placeholder="Wachtwoord"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && (
          <p key={error + String(submitting)} role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Bezig…' : 'Inloggen'}
        </button>

        <p className={styles.links}>
          <Link href="/registreren">Account aanmaken</Link>
          <Link href="/wachtwoord-vergeten">Wachtwoord vergeten?</Link>
        </p>
      </form>
    </AuthPage>
  );
}
