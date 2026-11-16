import type { ReactNode } from 'react';
import styles from './login.module.css';

// The logo and tagline above every signed-out screen (sign in, sign up, password reset).
export default function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.iconWrap}>
          <span className={styles.glow} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG, nothing for next/image to optimise */}
          <img src="/instavol-icon.svg" alt="" className={styles.icon} />
        </div>
        <h1 className={styles.wordmark}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
          <img src="/instavol-logo-wordmark-light.svg" alt="Instavol" className="on-light" />
          {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
          <img src="/instavol-logo-wordmark-dark.svg" alt="" className="on-dark" />
        </h1>
        <p className={styles.tagline}>Bewaar, vat samen, vind terug.</p>
      </div>
      {children}
    </main>
  );
}
