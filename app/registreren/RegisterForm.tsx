'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import AuthPage from '@/app/login/AuthPage';
import styles from '@/app/login/login.module.css';
import { register } from './actions';

export default function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await register({ name, email, password, inviteCode });
      if (result.ok) {
        router.replace('/');
        return;
      }
      setError(result.error);
    } catch {
      setError('Geen verbinding, probeer het opnieuw');
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
            aria-label="Naam"
            placeholder="Naam"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className={styles.field}
            type="email"
            aria-label="E-mailadres"
            placeholder="E-mailadres"
            autoComplete="email"
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
            placeholder="Wachtwoord (minstens 8 tekens)"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <input
            className={styles.field}
            aria-label="Uitnodigingscode"
            placeholder="Uitnodigingscode"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
          />
        </div>

        {error && (
          <p key={error + String(submitting)} role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Bezig…' : 'Account aanmaken'}
        </button>

        <p className={styles.links}>
          <Link href="/login">Al een account? Inloggen</Link>
        </p>
      </form>
    </AuthPage>
  );
}
