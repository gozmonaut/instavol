import { afterEach, vi } from 'vitest';
import { currentUser, signInAs } from '@/tests/helpers/user';

// Route tests don't talk to Neon Auth: the signed-in user comes from tests/helpers/user.ts.
vi.mock('@/lib/currentUser', () => ({
  getUserId: async () => currentUser.id,
  getSessionUserId: async () => currentUser.sessionId,
}));

afterEach(() => {
  signInAs('user-a');
});

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
