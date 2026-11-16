import type { Metadata } from 'next';
import { appName } from '@/lib/config';
import ForgotForm from './ForgotForm';

export const metadata: Metadata = {
  title: `Wachtwoord vergeten · ${appName}`,
};

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}
