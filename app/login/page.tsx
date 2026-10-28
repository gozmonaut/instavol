import type { Metadata } from 'next';
import { appName } from '@/lib/config';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: `Inloggen · ${appName}`,
};

export default function LoginPage() {
  return <LoginForm />;
}
