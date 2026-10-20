# Instavol — Backend & Website Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend API, database, AI processing pipeline, and browsing website for Instavol, so a URL POSTed to `/api/share` ends up stored, auto-summarized, auto-categorized, and visible/searchable on a website — fully testable with `curl` before any native Safari extension exists.

**Architecture:** A single Next.js (App Router) application deployed on Vercel, backed by a Neon Postgres database via Drizzle ORM. One bearer-token-protected API route (`/api/share`) accepts new links from the (future) Safari Share Extension; everything else is protected by HTTP Basic Auth. Saving responds immediately; page fetching, text extraction, and Gemini-based summarization/categorization happen afterward via Next.js's `after()` background-work API, with a manual "reprocess" endpoint as a fallback for anything that didn't finish.

**Tech Stack:** Next.js 15+ (App Router, TypeScript), Drizzle ORM + `@neondatabase/serverless` (Postgres/Neon), `@mozilla/readability` + `jsdom` (page text extraction), Google Gemini API free tier (REST, via `fetch`), Vitest + React Testing Library, deployed on Vercel.

**Spec:** [docs/superpowers/specs/2026-10-20-save-site-app-design.md](../specs/2026-10-20-save-site-app-design.md)

## Global Constraints

- Single user, no multi-user accounts or sharing (spec: "alleen Volkan, geen multi-user systeem").
- No manual category editing/merging in this version — categorization is fully automatic (spec: "puur automatisch systeem zonder handmatige correctiemogelijkheid is voor nu prima").
- No recurring cost: use the Gemini API **free tier** only, not a paid AI API (spec: reden is "geen kosten").
- `/api/share` is the only route the Safari Share Extension talks to; it is protected by a bearer API token, kept entirely separate from the website's Basic Auth (spec: "Authenticatie nu").
- Saving must respond fast — AI processing happens in the background, not inline with the save request (spec: "Asynchrone verwerking").
- A page that can't be fetched/read must still be saved (title + URL), marked clearly as failed, rather than losing the item (spec: "wat ik nog niet weet" — fetch-failure fallback).
- Requires Next.js >= 15 for the `after()` background-work API this plan relies on. **Verify this is still Vercel's documented way to run work after a response at implementation time** — I'm reasonably but not fully confident this API name/behavior hasn't changed since my knowledge cutoff.
- The exact Gemini model name/endpoint shape (`gemini-1.5-flash`, REST `generateContent` response shape) is **my best current knowledge, not a certainty** — verify against Google's current Gemini API docs when implementing Task 4, and keep the model name in an env var rather than hardcoding it.

## Review Focus

- Unreachable, paywalled, or JS-heavy pages must still be saved (title + URL) with a clear failed status, not lost or crashed on — tested in Task 3 (extraction throws a typed error) and Task 5 (processLink catches it and preserves the row).
- Gemini API errors or free-tier rate-limit responses must mark the link as failed with a message, not crash the save flow — tested in Task 4 (non-OK / malformed responses) and Task 5 (processLink catches Gemini errors).
- Pages with no extractable article text (SPA shells, video-only pages) must not silently produce an empty or garbage summary — tested in Task 3 (empty-content case throws the same typed error as fetch failure).
- Near-duplicate categories (e.g. "Tech" vs "Technologie") must be avoided by feeding existing categories to the AI and instructing it to reuse one when sensible — tested in Task 5 (existing categories are passed through) and Task 4 (prompt includes them).
- Saving the same URL twice must not crash (no accidental uniqueness constraint) and must behave predictably as two separate entries — tested in Task 7.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx` (placeholder), `lib/config.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `appName: string` exported from `lib/config.ts`, value `'Instavol'`.

- [ ] **Step 1: Scaffold the Next.js app**

Run: `npx create-next-app@latest . --typescript --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm`

- [ ] **Step 2: Install project dependencies**

Run:
```bash
npm install drizzle-orm @neondatabase/serverless jsdom @mozilla/readability
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event drizzle-kit @types/jsdom dotenv
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts` with the React plugin, default test environment `'node'`, and a `tests/` include path.

- [ ] **Step 4: Write the failing smoke test**

```ts
// tests/smoke.test.ts
import { appName } from '@/lib/config';
test('app config loads', () => {
  expect(appName).toBe('Instavol');
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run tests/smoke.test.ts`
Expected: FAIL — `lib/config` not found.

- [ ] **Step 6: Implement `lib/config.ts`**

```ts
export const appName = 'Instavol';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS

- [ ] **Step 8: Add `.gitignore` and `.env.example`**

`.gitignore` must exclude `node_modules`, `.next`, `.env`, `.env.test`, `.env.local`.
`.env.example` lists (empty) placeholders for: `DATABASE_URL`, `DATABASE_URL_TEST`, `API_TOKEN`, `SITE_USERNAME`, `SITE_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL`.

- [ ] **Step 9: Initialize git and commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js project"
```

---

## Task 2: Database schema and connection

**Files:**
- Create: `lib/schema.ts`, `lib/db.ts`, `drizzle.config.ts`, `tests/setup.ts`, `tests/db.test.ts`
- Modify: `vitest.config.ts` (add `setupFiles: ['tests/setup.ts']`), `.env.example` (drop the unused `DATABASE_URL_TEST` placeholder — see Controller Ruling below)

**Controller ruling (recorded in the SDD ledger):** this machine has no local Postgres and no Docker available, so the originally-planned "external scratch Postgres for `DATABASE_URL_TEST`" prerequisite is not viable here. Tests instead run against an in-memory **PGlite** instance (`@electric-sql/pglite`, via `drizzle-orm/pglite`) — no external database, service, or account needed. Production is unaffected: it still connects to real Neon Postgres via `DATABASE_URL`. Both are plain Drizzle instances exposing the same query builder, so every other task's code (which only imports `db`/`links` from these two files) is unaffected by this change.

**Interfaces:**
- Produces (used by every later task): Drizzle table `links` in `lib/schema.ts` with columns `id` (uuid, primary key, default random), `url` (text, not null), `title` (text, nullable), `status` (text, not null, default `'pending'`), `summary` (text, nullable), `category` (text, nullable), `errorMessage` (text, nullable), `createdAt` (timestamp, not null, default now), `updatedAt` (timestamp, not null, default now).
- Produces: `export type LinkRow = typeof links.$inferSelect;` in `lib/schema.ts`.
- Produces: `db` exported from `lib/db.ts` — when `NODE_ENV === 'test'`, a Drizzle instance over an in-memory `PGlite` database with the schema already migrated onto it; otherwise a Drizzle instance over `neon(process.env.DATABASE_URL)`.

- [ ] **Step 1: Install the PGlite test dependency**

Run: `npm install -D @electric-sql/pglite`

- [ ] **Step 2: Write `tests/setup.ts`**

Exports a `truncateLinks()` helper that `DELETE FROM links` between tests. (No `.env.test`/`DATABASE_URL_TEST` loading needed — the test database is in-memory, created fresh by `lib/db.ts` itself.)

- [ ] **Step 3: Write the failing test**

```ts
// tests/db.test.ts
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

test('inserting a link applies defaults', async () => {
  const [row] = await db.insert(links).values({ url: 'https://example.com' }).returning();
  expect(row.status).toBe('pending');
  expect(row.summary).toBeNull();
  expect(row.category).toBeNull();
  expect(row.createdAt).toBeInstanceOf(Date);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — `lib/schema` / `lib/db` not found.

- [ ] **Step 5: Implement `lib/schema.ts`**

Define the `links` pgTable exactly as specified in Interfaces above, plus the `LinkRow` type export.

- [ ] **Step 6: Create `drizzle.config.ts` and generate the migration**

`drizzle.config.ts` points at `lib/schema.ts` (dialect `postgresql`). Run: `npx drizzle-kit generate` — this reads the schema and writes a SQL migration file under `drizzle/` without needing any live database connection.

- [ ] **Step 7: Implement `lib/db.ts`**

When `NODE_ENV === 'test'`: create a `PGlite` instance (`new PGlite()`, in-memory, no path argument), wrap it with `drizzle(client, { schema })` from `drizzle-orm/pglite`, then apply the migration folder with `migrate(db, { migrationsFolder: './drizzle' })` from `drizzle-orm/pglite/migrator` before exporting `db` (top-level `await` is fine here). Otherwise: `drizzle(neon(process.env.DATABASE_URL), { schema })` from `drizzle-orm/neon-http`, with no migration step (Task 11 applies migrations to the real database separately via `drizzle-kit migrate`).

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS

- [ ] **Step 8b: Remove the unused `DATABASE_URL_TEST` line from `.env.example`**

It was added speculatively in Task 1 for an external test database that this task no longer uses (see Controller Ruling above).

- [ ] **Step 9: Commit**

```bash
git add lib/schema.ts lib/db.ts drizzle.config.ts drizzle/ tests/setup.ts tests/db.test.ts vitest.config.ts package.json package-lock.json .env.example
git commit -m "feat: add links table and db connection"
```

---

## Task 3: Page content extraction

**Files:**
- Create: `lib/extractPage.ts`, `tests/extractPage.test.ts`

**Interfaces:**
- Produces: `fetchPageText(url: string): Promise<{ title: string; text: string }>` in `lib/extractPage.ts`.
- Produces: `export class PageFetchError extends Error {}` — thrown when the page can't be fetched (non-OK HTTP response) or no readable article text can be extracted. Consumed by Task 5.

- [ ] **Step 1: Write the failing happy-path test**

```ts
// tests/extractPage.test.ts
import { fetchPageText, PageFetchError } from '@/lib/extractPage';

test('extracts title and article text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Fixture Title</title></head><body><article><p>Een bekende alinea met genoeg tekst om als artikel herkend te worden door Readability, zodat de test betrouwbaar is.</p></article></body></html>'
  , { status: 200 })));
  const result = await fetchPageText('https://example.com/article');
  expect(result.title).toBe('Fixture Title');
  expect(result.text).toContain('bekende alinea');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/extractPage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fetchPageText`**

Fetch the URL; if `!response.ok`, throw `PageFetchError`. Parse the HTML with `new JSDOM(html, { url })`, run `new Readability(dom.window.document).parse()`. If the result is `null` or its `textContent.trim()` is empty, throw `PageFetchError('Geen leesbare inhoud gevonden')`. Otherwise return `{ title: result.title || dom.window.document.title, text: result.textContent.trim() }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/extractPage.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing fetch-failure test (Review Focus)**

```ts
test('throws PageFetchError when the page cannot be fetched', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  await expect(fetchPageText('https://example.com/missing')).rejects.toBeInstanceOf(PageFetchError);
});
```

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `npx vitest run tests/extractPage.test.ts`
Expected: FAIL first (if the 404 check isn't yet in place), then add it to Step 3's implementation and re-run for PASS.

- [ ] **Step 7: Write the failing empty-content test (Review Focus)**

```ts
test('throws PageFetchError when there is no extractable article text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>App</title></head><body><div id="app"></div></body></html>', { status: 200 }
  )));
  await expect(fetchPageText('https://example.com/spa')).rejects.toBeInstanceOf(PageFetchError);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/extractPage.test.ts`
Expected: PASS (covered by Step 3's empty-content check)

- [ ] **Step 9: Commit**

```bash
git add lib/extractPage.ts tests/extractPage.test.ts
git commit -m "feat: add page text extraction"
```

---

## Task 4: Gemini summarization and categorization

**Files:**
- Create: `lib/gemini.ts`, `tests/gemini.test.ts`

**Interfaces:**
- Produces: `summarizeAndCategorize(pageText: string, existingCategories: string[]): Promise<{ summary: string; category: string }>` in `lib/gemini.ts`. Reads `process.env.GEMINI_API_KEY` and `process.env.GEMINI_MODEL` (default `'gemini-1.5-flash'` if unset).
- Produces: `export class GeminiError extends Error {}` — thrown on a non-OK API response or an unparseable/incomplete result. Consumed by Task 5.

- [ ] **Step 1: Write the failing happy-path test**

```ts
// tests/gemini.test.ts
import { summarizeAndCategorize, GeminiError } from '@/lib/gemini';

test('returns summary and category, and includes existing categories in the prompt', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"summary": "Korte samenvatting.", "category": "Tech"}' }] } }],
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const result = await summarizeAndCategorize('lange artikeltekst', ['Tech', 'Koken']);

  expect(result).toEqual({ summary: 'Korte samenvatting.', category: 'Tech' });
  const [, requestInit] = fetchMock.mock.calls[0];
  expect(requestInit.body).toContain('Tech');
  expect(requestInit.body).toContain('Koken');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gemini.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `summarizeAndCategorize`**

Build a Dutch-language prompt asking for strict JSON `{"summary": "...", "category": "..."}`, listing `existingCategories` and instructing the model to reuse one of them when it reasonably fits and invent a new one only when it doesn't. POST to `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`. If `!response.ok`, throw `GeminiError`. Parse `candidates[0].content.parts[0].text` as JSON (strip a leading/trailing ``` ```` ``` fence if present); throw `GeminiError` if parsing fails or `summary`/`category` are missing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gemini.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing non-OK-response test (Review Focus)**

```ts
test('throws GeminiError on a non-OK response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
  await expect(summarizeAndCategorize('tekst', [])).rejects.toBeInstanceOf(GeminiError);
});
```

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `npx vitest run tests/gemini.test.ts`
Expected: FAIL first, then PASS once Step 3's `!response.ok` check is confirmed correct.

- [ ] **Step 7: Write the failing malformed-response test**

```ts
test('throws GeminiError when the response is not valid JSON', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: 'not json' }] } }],
  }), { status: 200 })));
  await expect(summarizeAndCategorize('tekst', [])).rejects.toBeInstanceOf(GeminiError);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/gemini.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/gemini.ts tests/gemini.test.ts
git commit -m "feat: add Gemini summarization and categorization"
```

---

## Task 5: processLink orchestration

**Files:**
- Create: `lib/processLink.ts`, `tests/processLink.test.ts`

**Interfaces:**
- Consumes: `fetchPageText`, `PageFetchError` (Task 3); `summarizeAndCategorize`, `GeminiError` (Task 4); `db`, `links`, `LinkRow` (Task 2).
- Produces: `processLink(id: string): Promise<void>` in `lib/processLink.ts`. Consumed by Task 7 (fired in the background) and Task 9 (awaited directly).

- [ ] **Step 1: Write the failing happy-path test**

```ts
// tests/processLink.test.ts
import { processLink } from '@/lib/processLink';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/extractPage', () => ({ fetchPageText: vi.fn() }));
vi.mock('@/lib/gemini', () => ({ summarizeAndCategorize: vi.fn() }));

test('happy path: fetches, summarizes, categorizes, and backfills title', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  (fetchPageText as any).mockResolvedValue({ title: 'Page Title', text: 'content' });
  (summarizeAndCategorize as any).mockResolvedValue({ summary: 'Korte samenvatting', category: 'Tech' });

  const [row] = await db.insert(links).values({ url: 'https://example.com' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('done');
  expect(updated.title).toBe('Page Title');
  expect(updated.summary).toBe('Korte samenvatting');
  expect(updated.category).toBe('Tech');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/processLink.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `processLink`**

Load the row by `id`. Call `fetchPageText(row.url)`; if that succeeds, immediately update the row's `title` (only if the existing `title` is null/empty) — so the title is preserved even if the next step fails. Then query existing categories: `SELECT DISTINCT category FROM links WHERE category IS NOT NULL`. Call `summarizeAndCategorize(text, existingCategories)`. On success, update `summary`, `category`, `status: 'done'`, `updatedAt: new Date()`. Wrap the whole body (both the extraction and the Gemini call) in a `try/catch`: on any thrown error, update `status: 'failed'`, `errorMessage: error.message`, `updatedAt: new Date()`, leaving `url`/`title` untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/processLink.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing fetch-failure test (Review Focus)**

```ts
test('fetch failure marks the link failed and preserves url/title', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { PageFetchError } = await import('@/lib/extractPage');
  (fetchPageText as any).mockRejectedValue(new PageFetchError('Geen leesbare inhoud gevonden'));

  const [row] = await db.insert(links).values({ url: 'https://example.com/paywall', title: 'Oorspronkelijke titel' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('failed');
  expect(updated.errorMessage).toContain('leesbare inhoud');
  expect(updated.title).toBe('Oorspronkelijke titel');
  expect(updated.url).toBe('https://example.com/paywall');
});
```

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `npx vitest run tests/processLink.test.ts`
Expected: FAIL first (if the catch branch isn't yet correct), then PASS once Step 3's error handling is confirmed.

- [ ] **Step 7: Write the failing category-reuse test (Review Focus)**

```ts
test('passes existing categories to the AI so it can reuse them', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  (fetchPageText as any).mockResolvedValue({ title: 'Nieuwe pagina', text: 'content' });
  (summarizeAndCategorize as any).mockResolvedValue({ summary: 'x', category: 'Tech' });

  await db.insert(links).values({ url: 'https://a.example', category: 'Tech', status: 'done' });
  const [row] = await db.insert(links).values({ url: 'https://b.example' }).returning();

  await processLink(row.id);

  expect(summarizeAndCategorize).toHaveBeenCalledWith('content', expect.arrayContaining(['Tech']));
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/processLink.test.ts`
Expected: PASS (covered by Step 3's distinct-category query)

- [ ] **Step 9: Write the failing Gemini-failure test (Review Focus)**

```ts
test('Gemini failure marks the link failed but keeps the extracted title', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  const { GeminiError } = await import('@/lib/gemini');
  (fetchPageText as any).mockResolvedValue({ title: 'Geextraheerde titel', text: 'content' });
  (summarizeAndCategorize as any).mockRejectedValue(new GeminiError('rate limited'));

  const [row] = await db.insert(links).values({ url: 'https://c.example' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('failed');
  expect(updated.errorMessage).toContain('rate limited');
  expect(updated.title).toBe('Geextraheerde titel');
});
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/processLink.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add lib/processLink.ts tests/processLink.test.ts
git commit -m "feat: add processLink orchestration"
```

---

## Task 6: Auth helpers and website middleware

**Files:**
- Create: `lib/auth.ts`, `middleware.ts`, `tests/auth.test.ts`

**Interfaces:**
- Produces: `isValidApiToken(request: Request): boolean` in `lib/auth.ts` — checks header `Authorization: Bearer <token>` against `process.env.API_TOKEN`. Consumed by Task 7.
- Produces: `isValidBasicAuth(request: Request): boolean` in `lib/auth.ts` — checks header `Authorization: Basic <base64(user:pass)>` against `process.env.SITE_USERNAME`/`process.env.SITE_PASSWORD`. Consumed by `middleware.ts`.
- Produces: default-exported `middleware` in `middleware.ts`, matcher excluding `/api/share` and Next.js internals, returning `401` with a `WWW-Authenticate: Basic` header when `isValidBasicAuth` fails.

- [ ] **Step 1: Write the failing test for `isValidApiToken`**

```ts
// tests/auth.test.ts
import { isValidApiToken, isValidBasicAuth } from '@/lib/auth';

test('isValidApiToken accepts the matching bearer token', () => {
  process.env.API_TOKEN = 'secret123';
  const req = new Request('https://x', { headers: { Authorization: 'Bearer secret123' } });
  expect(isValidApiToken(req)).toBe(true);
});

test('isValidApiToken rejects a wrong or missing token', () => {
  process.env.API_TOKEN = 'secret123';
  expect(isValidApiToken(new Request('https://x', { headers: { Authorization: 'Bearer wrong' } }))).toBe(false);
  expect(isValidApiToken(new Request('https://x'))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `isValidApiToken`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (the two `isValidApiToken` tests)

- [ ] **Step 5: Write the failing test for `isValidBasicAuth`**

```ts
test('isValidBasicAuth accepts matching credentials', () => {
  process.env.SITE_USERNAME = 'user';
  process.env.SITE_PASSWORD = 'pass';
  const encoded = Buffer.from('user:pass').toString('base64');
  const req = new Request('https://x', { headers: { Authorization: `Basic ${encoded}` } });
  expect(isValidBasicAuth(req)).toBe(true);
});

test('isValidBasicAuth rejects wrong or missing credentials', () => {
  process.env.SITE_USERNAME = 'user';
  process.env.SITE_PASSWORD = 'pass';
  expect(isValidBasicAuth(new Request('https://x'))).toBe(false);
});
```

- [ ] **Step 6: Run test to verify it fails, implement, run to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL, then PASS after implementing `isValidBasicAuth`.

- [ ] **Step 7: Commit auth helpers**

```bash
git add lib/auth.ts tests/auth.test.ts
git commit -m "feat: add API token and basic auth helpers"
```

- [ ] **Step 8: Implement `middleware.ts`**

Use `isValidBasicAuth`; `matcher: ['/((?!api/share|_next|favicon.ico).*)']`; on failure return a `401` Response with header `WWW-Authenticate: 'Basic realm="Instavol"'`.

- [ ] **Step 9: Manually verify middleware behavior**

Run: `npm run dev`, then in another shell:
```bash
curl -i http://localhost:3000/
curl -i -u "$SITE_USERNAME:$SITE_PASSWORD" http://localhost:3000/
curl -i -X POST http://localhost:3000/api/share
```
Expected: first call `401` with `WWW-Authenticate: Basic`; second call `200`; third call reaches the (not-yet-implemented) share route rather than being blocked by middleware (a 404 is fine at this point — the point is it isn't a Basic Auth `401`).

- [ ] **Step 10: Commit**

```bash
git add middleware.ts
git commit -m "feat: protect website with basic auth middleware"
```

---

## Task 7: `POST /api/share` endpoint

**Files:**
- Create: `app/api/share/route.ts`, `tests/api.share.test.ts`

**Interfaces:**
- Consumes: `isValidApiToken` (Task 6), `db`, `links` (Task 2), `processLink` (Task 5).
- Produces: exported `POST(request: Request): Promise<Response>`. **This is the contract Plan B (Safari Share Extension) is built against:** `POST /api/share`, header `Authorization: Bearer <API_TOKEN>`, JSON body `{ url: string, title?: string }` → success `201 { id, url, title, status: 'pending' }`; bad/missing token → `401`; invalid/missing `url` → `400`.

- [ ] **Step 1: Write the failing happy-path test**

```ts
// tests/api.share.test.ts
import { POST } from '@/app/api/share/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq } from 'drizzle-orm';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: (cb: () => void) => cb(),
}));
vi.mock('@/lib/processLink', () => ({ processLink: vi.fn().mockResolvedValue(undefined) }));

function req(body: unknown, token = process.env.API_TOKEN) {
  return new Request('https://x/api/share', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('valid request creates a pending link and returns 201', async () => {
  const res = await POST(req({ url: 'https://example.com/a' }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.status).toBe('pending');
  const [row] = await db.select().from(links).where(eq(links.id, body.id));
  expect(row.url).toBe('https://example.com/a');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api.share.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement `POST` in `app/api/share/route.ts`**

Check `isValidApiToken(request)`, else `401`. Parse JSON body; validate `url` with `new URL(url)` (catch invalid), reject non-`http(s)` protocols, else `400`. Insert a row (`title` from body if present, else `null`). Call `import { after } from 'next/server'` and `after(() => processLink(row.id).catch(console.error))`. Return `201` with `{ id, url, title, status }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api.share.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing invalid-url test**

```ts
test('invalid url returns 400 and inserts nothing', async () => {
  const before = (await db.select().from(links)).length;
  const res = await POST(req({ url: 'not-a-url' }));
  expect(res.status).toBe(400);
  expect((await db.select().from(links)).length).toBe(before);
});
```

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `npx vitest run tests/api.share.test.ts`

- [ ] **Step 7: Write the failing bad-token test**

```ts
test('missing or wrong token returns 401 and inserts nothing', async () => {
  const before = (await db.select().from(links)).length;
  const res = await POST(req({ url: 'https://example.com/b' }, 'wrong-token'));
  expect(res.status).toBe(401);
  expect((await db.select().from(links)).length).toBe(before);
});
```

- [ ] **Step 8: Run test to verify it fails, then passes**

Run: `npx vitest run tests/api.share.test.ts`

- [ ] **Step 9: Write the failing duplicate-URL test (Review Focus)**

```ts
test('saving the same url twice creates two separate rows', async () => {
  const res1 = await POST(req({ url: 'https://example.com/dup' }));
  const res2 = await POST(req({ url: 'https://example.com/dup' }));
  expect(res1.status).toBe(201);
  expect(res2.status).toBe(201);
  const body1 = await res1.json();
  const body2 = await res2.json();
  expect(body1.id).not.toBe(body2.id);
});
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/api.share.test.ts`
Expected: PASS (no uniqueness constraint exists on `url`, so this should already pass)

- [ ] **Step 11: Commit**

```bash
git add app/api/share/route.ts tests/api.share.test.ts
git commit -m "feat: add POST /api/share endpoint"
```

---

## Task 8: Shared link queries and `GET /api/links` endpoint

**Files:**
- Create: `lib/links.ts`, `app/api/links/route.ts`, `tests/api.links.test.ts`

**Interfaces:**
- Produces: `getLinks(filters: { q?: string; category?: string }): Promise<LinkRow[]>` in `lib/links.ts` — newest first (`createdAt` desc); `q` case-insensitively matches `title` OR `summary`; `category` matches exactly; filters are combinable. Consumed by this task's route and by Task 10's `app/page.tsx`.
- Produces: exported `GET(request: Request): Promise<Response>` in `app/api/links/route.ts`, returning `200 { links: LinkRow[] }`; reads `q`/`category` from the URL's query string and delegates to `getLinks`.

- [ ] **Step 1: Write the failing "no filter" test**

```ts
// tests/api.links.test.ts
import { GET } from '@/app/api/links/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

test('returns all links newest first', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'A' });
  await db.insert(links).values({ url: 'https://b.example', title: 'B' });
  const res = await GET(new Request('https://x/api/links'));
  const body = await res.json();
  expect(body.links.map((l: any) => l.title)).toEqual(['B', 'A']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api.links.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getLinks` and the route**

`getLinks` builds a Drizzle query ordered by `desc(links.createdAt)`, adding `ilike(links.category, category)` and `or(ilike(links.title, '%q%'), ilike(links.summary, '%q%'))` clauses when provided. The route parses `URL(request.url).searchParams` and returns `Response.json({ links: await getLinks({ q, category }) })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api.links.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing category-filter test**

```ts
test('filters by category', async () => {
  await db.insert(links).values({ url: 'https://a.example', category: 'Tech' });
  await db.insert(links).values({ url: 'https://b.example', category: 'Koken' });
  const res = await GET(new Request('https://x/api/links?category=Tech'));
  const body = await res.json();
  expect(body.links).toHaveLength(1);
  expect(body.links[0].category).toBe('Tech');
});
```

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `npx vitest run tests/api.links.test.ts`

- [ ] **Step 7: Write the failing search test**

```ts
test('searches title and summary case-insensitively', async () => {
  await db.insert(links).values({ url: 'https://a.example', title: 'Interessant Artikel' });
  await db.insert(links).values({ url: 'https://b.example', summary: 'iets over koken' });
  await db.insert(links).values({ url: 'https://c.example', title: 'Niet relevant' });
  const res = await GET(new Request('https://x/api/links?q=interessant'));
  const body = await res.json();
  expect(body.links).toHaveLength(1);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/api.links.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/links.ts app/api/links/route.ts tests/api.links.test.ts
git commit -m "feat: add getLinks query and GET /api/links endpoint"
```

---

## Task 9: `POST /api/links/[id]/reprocess` endpoint

**Files:**
- Create: `app/api/links/[id]/reprocess/route.ts`, `tests/api.reprocess.test.ts`

**Interfaces:**
- Consumes: `processLink` (Task 5), `db`, `links` (Task 2).
- Produces: exported `POST(request: Request, { params }: { params: { id: string } }): Promise<Response>`. Awaits `processLink(id)` directly (not backgrounded — this is an explicit, infrequent manual retry). Returns `200` with the updated `LinkRow` on success, `404` if `id` doesn't exist.

- [ ] **Step 1: Write the failing happy-path test**

```ts
// tests/api.reprocess.test.ts
import { POST } from '@/app/api/links/[id]/reprocess/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

vi.mock('@/lib/extractPage', () => ({ fetchPageText: vi.fn().mockResolvedValue({ title: 'T', text: 'content' }) }));
vi.mock('@/lib/gemini', () => ({ summarizeAndCategorize: vi.fn().mockResolvedValue({ summary: 'S', category: 'Tech' }) }));

test('reprocesses a failed link and returns the updated row', async () => {
  const [row] = await db.insert(links).values({ url: 'https://x.example', status: 'failed', errorMessage: 'oud probleem' }).returning();
  const res = await POST(new Request('https://x'), { params: { id: row.id } });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('done');
  expect(body.summary).toBe('S');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api.reprocess.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Check the row exists (`SELECT ... WHERE id = params.id`), else `404`. Otherwise `await processLink(params.id)`, re-select the row, return `200` with it as JSON.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api.reprocess.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing unknown-id test**

```ts
test('unknown id returns 404', async () => {
  const res = await POST(new Request('https://x'), { params: { id: '00000000-0000-0000-0000-000000000000' } });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `npx vitest run tests/api.reprocess.test.ts`

- [ ] **Step 7: Commit**

```bash
git add app/api/links/\[id\]/reprocess/route.ts tests/api.reprocess.test.ts
git commit -m "feat: add POST /api/links/:id/reprocess endpoint"
```

---

## Task 10: Website UI — list, search, filter, retry

**Files:**
- Create: `app/components/LinksBrowser.tsx`, `tests/LinksBrowser.test.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `LinkRow` (Task 2), `getLinks` (Task 8, server-side in `app/page.tsx`), `GET /api/links` and `POST /api/links/[id]/reprocess` (Tasks 8–9, client-side via `fetch`).
- Produces: default export `LinksBrowser({ initialLinks: LinkRow[] })` in `app/components/LinksBrowser.tsx`.

- [ ] **Step 1: Write the failing render test**

```tsx
// @vitest-environment jsdom
// tests/LinksBrowser.test.tsx
import { render, screen } from '@testing-library/react';
import LinksBrowser from '@/app/components/LinksBrowser';

const fixture = [
  { id: '1', url: 'https://a.example', title: 'Artikel A', status: 'done', summary: 'Samenvatting A', category: 'Tech', errorMessage: null, createdAt: new Date().toISOString() },
  { id: '2', url: 'https://b.example', title: 'Artikel B', status: 'failed', summary: null, category: null, errorMessage: 'Kon pagina niet ophalen', createdAt: new Date().toISOString() },
];

test('renders links, and only shows retry for non-done items', () => {
  render(<LinksBrowser initialLinks={fixture as any} />);
  expect(screen.getByText('Artikel A')).toBeInTheDocument();
  expect(screen.getByText('Samenvatting A')).toBeInTheDocument();
  expect(screen.getAllByText('Opnieuw verwerken')).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/LinksBrowser.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `LinksBrowser`**

Render a search `<input>`, a `<select>` built from the distinct categories present in the current list, and a card per link: title linking to `url`, domain (derived from `url`), formatted `createdAt`, a category badge, the `summary` or a `"Wordt verwerkt..."` / `"Mislukt: " + errorMessage` placeholder depending on `status`, and an "Opnieuw verwerken" button rendered only when `status !== 'done'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/LinksBrowser.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing search test**

```tsx
test('typing in search fetches /api/links?q=... and replaces the list', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture as any} />);
  await userEvent.type(screen.getByRole('searchbox'), 'Artikel A');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('q=Artikel')));
});
```

- [ ] **Step 6: Run test to verify it fails, implement, run to verify it passes**

Add a debounced (plain `setTimeout`, no new dependency) effect that re-fetches `/api/links` with the current `q`/`category` and replaces the rendered list with the response.

Run: `npx vitest run tests/LinksBrowser.test.tsx`

- [ ] **Step 7: Write the failing category-filter test**

```tsx
test('selecting a category fetches /api/links?category=...', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture as any} />);
  await userEvent.selectOptions(screen.getByRole('combobox'), 'Tech');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=Tech')));
});
```

- [ ] **Step 8: Run test to verify it fails, then passes**

Run: `npx vitest run tests/LinksBrowser.test.tsx`

- [ ] **Step 9: Write the failing retry test**

```tsx
test('clicking retry calls the reprocess endpoint and updates the item', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ...fixture[1], status: 'done', summary: 'Nu wel gelukt' }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture as any} />);
  await userEvent.click(screen.getByText('Opnieuw verwerken'));
  expect(fetchMock).toHaveBeenCalledWith('/api/links/2/reprocess', expect.objectContaining({ method: 'POST' }));
  await screen.findByText('Nu wel gelukt');
});
```

- [ ] **Step 10: Run test to verify it fails, then passes**

Run: `npx vitest run tests/LinksBrowser.test.tsx`

- [ ] **Step 11: Implement `app/page.tsx` as a server component**

```tsx
import { getLinks } from '@/lib/links';
import LinksBrowser from '@/app/components/LinksBrowser';

export default async function Page() {
  const initialLinks = await getLinks({});
  return <LinksBrowser initialLinks={initialLinks} />;
}
```

- [ ] **Step 12: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 13: Commit**

```bash
git add app/page.tsx app/components/LinksBrowser.tsx tests/LinksBrowser.test.tsx
git commit -m "feat: add website list, search, filter, and retry UI"
```

---

## Task 11: Deploy to Vercel and Neon

**Files:**
- Modify: `.env.example` (finalize), `README.md` (create — short setup/deploy notes)

**Interfaces:** none (deployment/documentation task; no code interface).

- [ ] **Step 1: Finalize `.env.example`**

List `DATABASE_URL`, `API_TOKEN`, `SITE_USERNAME`, `SITE_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL`, each with a one-line comment on what it's for.

- [ ] **Step 2: Create the production database**

Manual: create a Neon Postgres database; set `DATABASE_URL`; run `npx drizzle-kit migrate` against it to apply the migration(s) generated in Task 2.

- [ ] **Step 3: Get a Gemini API key**

Manual: create a free API key in Google AI Studio; set `GEMINI_API_KEY`. **Confirm at this point which model name is current on the free tier** and set `GEMINI_MODEL` accordingly (do not assume `gemini-1.5-flash` is still correct without checking).

- [ ] **Step 4: Deploy to Vercel**

Manual: create a Vercel project from this repository, set all env vars from `.env.example` in the Vercel project settings, deploy. **Requires explicit confirmation before this step is actually run, per project rules on deploying.**

- [ ] **Step 5: Verify the deployed app end-to-end**

```bash
curl -i -X POST https://<deployment-url>/api/share \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
# expect 201

sleep 5

curl -s -u "$SITE_USERNAME:$SITE_PASSWORD" https://<deployment-url>/api/links
# expect the item above, with status "done" (summary + category) or "failed" with a readable errorMessage
```

- [ ] **Step 6: Commit documentation**

```bash
git add .env.example README.md
git commit -m "docs: add deployment notes"
```
