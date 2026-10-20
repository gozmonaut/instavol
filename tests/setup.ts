import { afterEach } from 'vitest';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

export async function truncateLinks() {
  await db.delete(links);
}

afterEach(async () => {
  await truncateLinks();
});
