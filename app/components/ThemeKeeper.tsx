'use client';

import { useEffect } from 'react';

// The theme chosen with the header button is put on <html> by a script in the layout, before the
// first paint. If React ever has to rebuild the page in the browser (after a hydration mismatch),
// it clears every attribute on <html>, including that one; this puts the choice back.
export default function ThemeKeeper() {
  useEffect(() => {
    try {
      const theme = localStorage.getItem('instavol-theme');
      if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    } catch {
      // Storage blocked: the device setting decides.
    }
  }, []);
  return null;
}
