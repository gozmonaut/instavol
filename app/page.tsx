import { redirect } from 'next/navigation';
import { getSessionUserId, getUserId } from '@/lib/currentUser';
import { getLinks } from '@/lib/links';
import LinksBrowser from '@/app/components/LinksBrowser';

// Without this, Next.js tries to statically prerender this page at build
// time, running getLinks() once and baking that snapshot into the build —
// new/updated links would never show up until the next deploy.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const userId = await getUserId();
  if (!userId) {
    // Signed in but never invited, or not signed in at all.
    redirect((await getSessionUserId()) ? '/geen-toegang' : '/login');
  }
  const initialLinks = await getLinks(userId, {});
  return <LinksBrowser initialLinks={initialLinks} />;
}
