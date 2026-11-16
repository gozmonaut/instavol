'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth/client';
import AuthPage from './AuthPage';
import styles from './login.module.css';

const WRONG_CREDENTIALS = 'Onjuist e-mailadres of wachtwoord';

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
    try {
      const { error: rejected } = await authClient.signIn.email({ email, password });
      if (!rejected) {
        router.replace('/');
        return;
      }
      setError(WRONG_CREDENTIALS);
      setPassword('');
    } catch (thrown) {
      // The auth client throws on a rejected sign-in (it carries the HTTP status); anything else is the network.
      if (typeof thrown === 'object' && thrown !== null && 'status' in thrown) {
        setError(WRONG_CREDENTIALS);
        setPassword('');
      } else {
        setError('Geen verbinding, probeer het opnieuw');
      }
    } finally {
      setSubmitting(false);
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
