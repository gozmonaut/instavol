import type { Metadata } from 'next';
import { appName } from '@/lib/config';
import RegisterForm from './RegisterForm';

export const metadata: Metadata = {
  title: `Account aanmaken · ${appName}`,
};

export default function RegisterPage() {
  return <RegisterForm />;
}
