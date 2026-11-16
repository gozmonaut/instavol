import { beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getCategories } from '@/app/api/categories/route';
import { GET as getContent } from '@/app/api/links/[id]/content/route';
import { DELETE as deleteHighlight } from '@/app/api/links/[id]/highlights/[highlightId]/route';
import { POST as addHighlight } from '@/app/api/links/[id]/highlights/route';
import { DELETE as deleteNote } from '@/app/api/links/[id]/notes/[noteId]/route';
import { POST as addNote } from '@/app/api/links/[id]/notes/route';
import { POST as reprocess } from '@/app/api/links/[id]/reprocess/route';
import { DELETE as deleteLink, PATCH as patchLink } from '@/app/api/links/[id]/route';
import { POST as recategorize } from '@/app/api/links/recategorize/route';
import { POST as refreshReader } from '@/app/api/links/refresh-reader/route';
import { GET as getLinks, POST as postLink } from '@/app/api/links/route';
import { GET as getTags } from '@/app/api/tags/route';
import { db } from '@/lib/db';
import { fetchPageText } from '@/lib/extractPage';
import { categorize, summarizeAndCategorize } from '@/lib/gemini';
import { processLink } from '@/lib/processLink';
import { linkContents, links, type LinkRow } from '@/lib/schema';
import { signInAs } from '@/tests/helpers/user';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: () => {},
}));
vi.mock('@/lib/extractPage', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchPageText: vi.fn(),
}));
vi.mock('@/lib/gemini', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  categorize: vi.fn(),
  summarizeAndCategorize: vi.fn(),
}));

const OLD = new Date('2026-01-01T00:00:00Z');
let mine: LinkRow;
let theirs: LinkRow;

beforeEach(async () => {
  vi.mocked(fetchPageText).mockReset().mockResolvedValue({ title: 'T', text: 'content' });
  vi.mocked(summarizeAndCategorize).mockReset().mockResolvedValue({ summary: 'S', category: 'Nieuw' });
  vi.mocked(categorize).mockReset().mockResolvedValue('Nieuw');
  [mine] = await db
    .insert(links)
    .values({ userId: 'user-a', url: 'https://a.example', title: 'Van A', status: 'done', category: 'Alleen-A', tags: ['tag-a'], updatedAt: OLD })
    .returning();
  [theirs] = await db
    .insert(links)
    .values({
      userId: 'user-b',
      url: 'https://b.example',
      title: 'Van B',
      status: 'done',
      category: 'Alleen-B',
      tags: ['tag-b'],
      notes: [{ id: 'note-b', text: 'geheim', createdAt: OLD.toISOString() }],
      highlights: [{ id: 'hl-b', text: 'gemarkeerd', prefix: '', suffix: '', createdAt: OLD.toISOString() }],
      updatedAt: OLD,
    })
    .returning();
  await db.insert(linkContents).values({ linkId: theirs.id, html: '<p>van B</p>' });
  signInAs('user-a');
});

const json = (body: unknown, method = 'POST') =>
  new Request('https://x/api', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const bare = (method = 'GET') => new Request('https://x/api', { method });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });

async function theirRow(): Promise<LinkRow> {
  const [row] = await db.select().from(links).where(eq(links.id, theirs.id));
  return row;
}

test('the list, the categories and the tags only show your own data', async () => {
  const list = await (await getLinks(new Request('https://x/api/links'))).json();
  expect(list.links.map((l: LinkRow) => l.title)).toEqual(['Van A']);
  expect((await (await getCategories()).json()).categories).toEqual(['Alleen-A']);
  expect((await (await getTags()).json()).tags).toEqual(['tag-a']);
});

test('searching does not find someone else\'s link', async () => {
  const list = await (await getLinks(new Request('https://x/api/links?q=geheim'))).json();
  expect(list.links).toEqual([]);
});

test('a link saved from the website belongs to whoever saved it', async () => {
  const res = await postLink(json({ url: 'https://new.example' }));
  expect(res.status).toBe(201);
  const [row] = await db.select().from(links).where(eq(links.url, 'https://new.example'));
  expect(row.userId).toBe('user-a');
});

// Every route that takes a link id, called by user-a with user-b's link.
const onTheirLink: [string, () => Promise<Response>][] = [
  ['PATCH link', () => patchLink(json({ category: 'Gekaapt' }, 'PATCH'), params({ id: theirs.id }))],
  ['DELETE link', () => deleteLink(bare('DELETE'), params({ id: theirs.id }))],
  ['GET content', () => getContent(bare(), params({ id: theirs.id }))],
  ['POST note', () => addNote(json({ text: 'van A' }), params({ id: theirs.id }))],
  ['DELETE note', () => deleteNote(bare('DELETE'), params({ id: theirs.id, noteId: 'note-b' }))],
  ['POST highlight', () => addHighlight(json({ text: 'van A' }), params({ id: theirs.id }))],
  ['DELETE highlight', () => deleteHighlight(bare('DELETE'), params({ id: theirs.id, highlightId: 'hl-b' }))],
  ['POST reprocess', () => reprocess(bare('POST'), params({ id: theirs.id }))],
];

test.each(onTheirLink)('%s on someone else\'s link is a 404 and changes nothing', async (_name, call) => {
  const res = await call();
  expect(res.status).toBe(404);
  expect(await theirRow()).toEqual(theirs);
  expect(await db.select().from(linkContents)).toHaveLength(1);
});

const everyRoute: [string, () => Promise<Response>][] = [
  ['GET links', () => getLinks(new Request('https://x/api/links'))],
  ['POST links', () => postLink(json({ url: 'https://new.example' }))],
  ['GET categories', () => getCategories()],
  ['GET tags', () => getTags()],
  ['POST recategorize', () => recategorize(json({}))],
  ['POST refresh-reader', () => refreshReader(json({}))],
  ['PATCH link', () => patchLink(json({ category: 'X' }, 'PATCH'), params({ id: mine.id }))],
  ['DELETE link', () => deleteLink(bare('DELETE'), params({ id: mine.id }))],
  ['GET content', () => getContent(bare(), params({ id: mine.id }))],
  ['POST note', () => addNote(json({ text: 'x' }), params({ id: mine.id }))],
  ['DELETE note', () => deleteNote(bare('DELETE'), params({ id: mine.id, noteId: 'n' }))],
  ['POST highlight', () => addHighlight(json({ text: 'x' }), params({ id: mine.id }))],
  ['DELETE highlight', () => deleteHighlight(bare('DELETE'), params({ id: mine.id, highlightId: 'h' }))],
  ['POST reprocess', () => reprocess(bare('POST'), params({ id: mine.id }))],
];

test.each(everyRoute)('%s without a signed-in user is a 401', async (_name, call) => {
  signInAs(null);
  expect((await call()).status).toBe(401);
  expect(await db.select().from(links)).toHaveLength(2);
});

test.each(everyRoute)('%s for an account that was never invited is a 401', async (_name, call) => {
  signInAs('user-c', { member: false });
  expect((await call()).status).toBe(401);
  expect(await db.select().from(links)).toHaveLength(2);
});

test('recategorizing only touches your own links', async () => {
  const res = await recategorize(json({}));
  expect((await res.json()).processed).toBe(1);
  expect(await theirRow()).toEqual(theirs);
});

test('refreshing the reader only touches your own links', async () => {
  const res = await refreshReader(json({}));
  expect((await res.json()).processed).toBe(1);
  expect(await theirRow()).toEqual(theirs);
});

test('the AI is only offered the categories of the link\'s owner', async () => {
  await processLink(mine.id);
  expect(vi.mocked(summarizeAndCategorize).mock.calls[0][1]).toEqual(['Alleen-A']);
});

test('a manual category reuses your own spelling, not someone else\'s', async () => {
  const res = await patchLink(json({ category: 'alleen-b' }, 'PATCH'), params({ id: mine.id }));
  expect((await res.json()).category).toBe('Alleen-b');
});
