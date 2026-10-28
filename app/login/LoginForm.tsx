'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import styles from './login.module.css';

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace('/');
        return;
      }
      setError(res.status === 401 ? 'Onjuiste gebruikersnaam of wachtwoord' : 'Inloggen mislukt, probeer het opnieuw');
      setPassword('');
    } catch {
      setError('Geen verbinding, probeer het opnieuw');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.iconWrap}>
          <span className={styles.glow} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG, nothing for next/image to optimise */}
          <img src="/instavol-icon.svg" alt="" className={styles.icon} />
        </div>
        <h1 className={styles.wordmark}>
          <picture>
            <source srcSet="/instavol-logo-wordmark-dark.svg" media="(prefers-color-scheme: dark)" />
            <img src="/instavol-logo-wordmark-light.svg" alt="Instavol" />
          </picture>
        </h1>
        <p className={styles.tagline}>Bewaar, vat samen, vind terug.</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.group}>
          <input
            className={styles.field}
            aria-label="Gebruikersnaam"
            placeholder="Gebruikersnaam"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
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
      </form>
    </main>
  );
}
