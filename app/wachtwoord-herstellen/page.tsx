import type { Metadata } from 'next';
import { appName } from '@/lib/config';
import ResetForm from './ResetForm';

export const metadata: Metadata = {
  title: `Nieuw wachtwoord · ${appName}`,
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ResetForm token={typeof token === 'string' ? token : undefined} />;
}
