import { getLinks } from '@/lib/links';
import LinksBrowser from '@/app/components/LinksBrowser';

// Without this, Next.js tries to statically prerender this page at build
// time, running getLinks() once and baking that snapshot into the build —
// new/updated links would never show up until the next deploy.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const initialLinks = await getLinks({});
  return <LinksBrowser initialLinks={initialLinks} />;
}
