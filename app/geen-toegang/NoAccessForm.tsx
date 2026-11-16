'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import AuthPage from '@/app/login/AuthPage';
import styles from '@/app/login/login.module.css';
import { joinWithInviteCode } from '@/app/registreren/actions';
import { authClient } from '@/lib/auth/client';

// Shown to an account that is signed in but was never invited.
export default function NoAccessForm() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await joinWithInviteCode(inviteCode);
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

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      // Leave this screen anyway; the login screen sends a still-valid session straight back.
    }
    router.replace('/login');
  }

  return (
    <AuthPage>
      <form className={styles.form} onSubmit={handleSubmit}>
        <p className={styles.notice}>Dit account heeft nog geen toegang. Je hebt een uitnodigingscode nodig.</p>
        <div className={styles.group}>
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
          {submitting ? 'Bezig…' : 'Doorgaan'}
        </button>

        <p className={styles.links}>
          <button type="button" className={styles.linkButton} onClick={handleSignOut}>
            Uitloggen
          </button>
        </p>
      </form>
    </AuthPage>
  );
}
