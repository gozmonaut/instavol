import { GET } from '@/app/api/links/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

test('returns all links newest first', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'A' });
  await db.insert(links).values({ url: 'https://b.example', title: 'B' });
  const res = await GET(new Request('https://x/api/links'));
  const body = await res.json();
  expect(body.links.map((l: { title: string | null }) => l.title)).toEqual(['B', 'A']);
});

test('filters by category', async () => {
  await db.insert(links).values({ url: 'https://a.example', category: 'Tech' });
  await db.insert(links).values({ url: 'https://b.example', category: 'Koken' });
  const res = await GET(new Request('https://x/api/links?category=Tech'));
  const body = await res.json();
  expect(body.links).toHaveLength(1);
  expect(body.links[0].category).toBe('Tech');
});

test('searches title and summary case-insensitively', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'Interessant Artikel' });
  await db.insert(links).values({ url: 'https://b.example', summary: 'iets over koken' });
  await db.insert(links).values({ url: 'https://c.example', title: 'Niet relevant' });
  const res = await GET(new Request('https://x/api/links?q=interessant'));
  const body = await res.json();
  expect(body.links).toHaveLength(1);
});

test('q matches the summary column', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'Iets anders' });
  await db.insert(links).values({ url: 'https://b.example', summary: 'iets over koken' });
  const res = await GET(new Request('https://x/api/links?q=KOKEN'));
  const body = await res.json();
  expect(body.links.map((l: { url: string }) => l.url)).toEqual(['https://b.example']);
});

test('q also finds an item by one of its tags, or by part of a tag', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'Ander ding', tags: ['romeinen', 'geschiedenis'] });
  await db.insert(links).values({ url: 'https://b.example', title: 'Niets', tags: ['koken'] });
  await db.insert(links).values({ url: 'https://c.example', title: 'Zonder tags' });
  const exact = await (await GET(new Request('https://x/api/links?q=ROMEINEN'))).json();
  expect(exact.links.map((l: { url: string }) => l.url)).toEqual(['https://a.example']);
  const part = await (await GET(new Request('https://x/api/links?q=geschied'))).json();
  expect(part.links.map((l: { url: string }) => l.url)).toEqual(['https://a.example']);
});

test('q also finds an item by the text of one of its notes', async () => {
  const note = (text: string) => ({ id: crypto.randomUUID(), text, createdAt: '2026-11-04T10:00:00.000Z' });
  await db.insert(links).values({ url: 'https://a.example', title: 'Ander ding', notes: [note('Minder zout gebruiken'), note('Lekker met rijst')] });
  await db.insert(links).values({ url: 'https://b.example', title: 'Niets', notes: [note('Iets anders')] });
  await db.insert(links).values({ url: 'https://c.example', title: 'Zonder notities' });
  const body = await (await GET(new Request('https://x/api/links?q=ZOUT'))).json();
  expect(body.links.map((l: { url: string }) => l.url)).toEqual(['https://a.example']);
  const rice = await (await GET(new Request('https://x/api/links?q=met%20rijst'))).json();
  expect(rice.links.map((l: { url: string }) => l.url)).toEqual(['https://a.example']);
});

test('q and category filters combine', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'Interessant', category: 'Tech' });
  await db.insert(links).values({ url: 'https://b.example', title: 'Interessant', category: 'Koken' });
  await db.insert(links).values({ url: 'https://c.example', title: 'Ander', category: 'Tech' });
  const res = await GET(new Request('https://x/api/links?q=interessant&category=Tech'));
  const body = await res.json();
  expect(body.links.map((l: { url: string }) => l.url)).toEqual(['https://a.example']);
});

test('category matches exactly, not as a substring or case-insensitively', async () => {
  await db.insert(links).values({ url: 'https://a.example', category: 'Tech' });
  await db.insert(links).values({ url: 'https://b.example', category: 'Technologie' });
  const res = await GET(new Request('https://x/api/links?category=tech'));
  const body = await res.json();
  expect(body.links).toHaveLength(0);
});

test('q treats % and _ literally', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'Alles 100% zeker' });
  await db.insert(links).values({ url: 'https://b.example', title: 'Alles 100 procent' });
  const res = await GET(new Request('https://x/api/links?q=100%25'));
  const body = await res.json();
  expect(body.links.map((l: { url: string }) => l.url)).toEqual(['https://a.example']);
});

test('empty q and category are treated as no filter', async () => {
  await db.insert(links).values({ url: 'https://a.example' });
  await db.insert(links).values({ url: 'https://b.example', title: 'B', category: 'Tech' });
  const res = await GET(new Request('https://x/api/links?q=&category='));
  const body = await res.json();
  expect(body.links).toHaveLength(2);
});
