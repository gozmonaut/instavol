import { afterEach } from 'vitest';

// jsdom-environment tests don't use the database, and PGlite can't load under jsdom's Blob.
const isJsdom = typeof window !== 'undefined';

export async function truncateLinks() {
  const { db } = await import('@/lib/db');
  const { links, members, shareTokens, sitePassword } = await import('@/lib/schema');
  await db.delete(links);
  await db.delete(members);
  await db.delete(shareTokens);
  await db.delete(sitePassword);
}

if (!isJsdom) {
  afterEach(async () => {
    await truncateLinks();
  });
}
