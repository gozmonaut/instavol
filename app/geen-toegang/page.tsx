import type { Metadata } from 'next';
import { appName } from '@/lib/config';
import NoAccessForm from './NoAccessForm';

export const metadata: Metadata = {
  title: `Geen toegang · ${appName}`,
};

export default function NoAccessPage() {
  return <NoAccessForm />;
}
