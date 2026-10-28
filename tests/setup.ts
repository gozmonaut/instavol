import { afterEach } from 'vitest';

// jsdom-environment tests don't use the database, and PGlite can't load under jsdom's Blob.
const isJsdom = typeof window !== 'undefined';

export async function truncateLinks() {
  const { db } = await import('@/lib/db');
  const { links } = await import('@/lib/schema');
  await db.delete(links);
}

if (!isJsdom) {
  afterEach(async () => {
    await truncateLinks();
  });
}
