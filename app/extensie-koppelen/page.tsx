import type { Metadata } from 'next';
import { appName } from '@/lib/config';
import PairExtension from './PairExtension';

export const metadata: Metadata = {
  title: `Safari-extensie koppelen · ${appName}`,
};

export default function PairExtensionPage() {
  return <PairExtension />;
}
