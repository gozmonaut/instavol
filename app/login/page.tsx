import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { appName } from '@/lib/config';
import { getSessionUserId } from '@/lib/currentUser';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: `Inloggen · ${appName}`,
};

// Reads the session, so this page can't be prerendered.
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Already signed in: straight to the app.
  if (await getSessionUserId()) redirect('/');
  return <LoginForm />;
}
