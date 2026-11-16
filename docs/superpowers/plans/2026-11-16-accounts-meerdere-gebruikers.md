# Accounts voor meerdere gebruikers — bouwplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Familieleden maken met een uitnodigingscode een eigen account aan, loggen in met e-mail en wachtwoord, kunnen hun wachtwoord herstellen en zien alleen hun eigen links.

**Architecture:** Neon Auth (beheerde Better Auth) levert accounts, sessies en de herstelmail. De app houdt zelf bij wie uitgenodigd is (tabel `members`), wie eigenaar is van een link (`links.user_id`) en welk opslaan-token bij wie hoort (`share_tokens`). Eén functie, `getUserId()`, is de enige plek die bepaalt wie de ingelogde, uitgenodigde gebruiker is; elke route en query gebruikt die.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`), Neon Auth SDK, Drizzle, Neon Postgres, Vitest met PGlite.

**Spec:** `docs/superpowers/specs/2026-11-16-accounts-meerdere-gebruikers-design.md`

## Global Constraints

- Lees eerst de relevante gids in `node_modules/next/dist/docs/` (zie `AGENTS.md`); deze Next.js-versie wijkt af.
- Al het werk op branch `feat/accounts`, niet op `main`. Niet pushen zonder akkoord van Volkan.
- Lokaal werken tegen de Neon-testbranch, nooit tegen productie. Controleer vóór elke migratie of elk script dat `DATABASE_URL` naar de testbranch wijst.
- Migraties draaien, omgevingsvariabelen in Vercel, instellingen in de Neon-console, deployen: alleen na uitdrukkelijk akkoord van Volkan in het gesprek.
- Interfacetekst in het Nederlands, bestaande stijl (CSS modules, geen Tailwind). Foutmeldingen verraden niet of een e-mailadres bestaat.
- Geen foreign key naar het schema `neon_auth` (bestaat niet in PGlite).
- Wijzig alleen wat deze taak vraagt; geen opruimwerk elders.
- Een link van een ander gedraagt zich als een link die niet bestaat: 404.
- Minimale wachtwoordlengte blijft 8 tekens.
- Tests draaien met `npx vitest run <bestand>`; alles met `npx vitest run`, `npx tsc --noEmit`, `npx eslint`.

## Review Focus

1. Id van een link van een ander op elke `[id]`-route (PATCH, DELETE, notes, highlights, content, reprocess): 404 en niets gewijzigd. → Taak 4.
2. Geldige sessie maar niet in `members` (account buiten de app om aangemaakt): 401 op elke API-route, geen data op `/`. → Taak 3 en 4.
3. `INVITE_CODE` niet ingesteld, leeg of fout: registratie geweigerd en er wordt geen account bij Neon aangemaakt. → Taak 6.
4. `processLink` voor gebruiker A biedt de AI alleen A's categorieën aan, ook als B dezelfde of andere categorieën heeft. → Taak 4.
5. Na vervangen van het opslaan-token werkt het oude niet meer; leeg of onbekend token geeft 401 en slaat niets op. → Taak 5.

---

## Bestanden

| Bestand | Verantwoordelijkheid |
|---|---|
| `lib/auth/server.ts` (nieuw) | Neon Auth server-instantie `auth` |
| `lib/auth/client.ts` (nieuw) | Browserclient `authClient` |
| `app/api/auth/[...path]/route.ts` (nieuw) | Doorgeefroute naar Neon Auth |
| `lib/members.ts` (nieuw) | Wie is uitgenodigd |
| `lib/currentUser.ts` (nieuw) | `getUserId()` |
| `lib/invite.ts` (nieuw) | Uitnodigingscode controleren |
| `lib/shareTokens.ts` (nieuw) | Opslaan-tokens maken en opzoeken |
| `app/api/share-token/route.ts` (nieuw) | Token opvragen/maken vanuit instellingen |
| `app/registreren/`, `app/wachtwoord-vergeten/`, `app/wachtwoord-herstellen/`, `app/geen-toegang/` (nieuw) | Schermen |
| `scripts/claim-links.ts` (nieuw) | Bestaande links aan Volkans account koppelen |
| `lib/schema.ts`, `lib/links.ts`, `lib/processLink.ts`, `proxy.ts`, `app/page.tsx`, alle routes onder `app/api/links`, `app/api/categories`, `app/api/tags`, `app/api/share`, `app/login/*`, `app/components/LinksBrowser.tsx`, `tests/setup.ts`, `.env.example`, `HANDOFF.md` | Aanpassen |
| `lib/session.ts`, `lib/password.ts`, `lib/auth.ts`, `app/api/login`, `app/api/logout`, `app/api/password` en hun tests | Verwijderen (taak 7; lijst eerst aan Volkan voorleggen) |

---

### Taak 0: Voorwerk (met Volkan)

- [ ] **Stap 1:** Neon-testbranch `accounts-test` vanaf productie (kopie van de data, dus ook de bestaande links). Neon Auth moet op die branch aan staan met "Sign-in with Email".
- [ ] **Stap 2:** `.env.local`: `DATABASE_URL` en `NEON_AUTH_BASE_URL` van de testbranch; nieuwe `NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`) en `INVITE_CODE`. Bewaar de productiewaarden niet in de repo.
- [ ] **Stap 3:** `git switch -c feat/accounts`.
- [ ] **Stap 4:** Controleer: `npx vitest run` is groen vóór enige wijziging.

### Taak 1: Proef (weggooicode)

Beantwoordt de vier onzekerheden uit de spec. Niets uit deze taak blijft staan behalve de bevindingen.

- [ ] **Stap 1:** Bepaal de actuele pakketnaam (`@neon/auth` of `@neondatabase/auth`) en of die Next 16.4 ondersteunt; installeer die (akkoord Volkan: nieuwe dependency).
- [ ] **Stap 2:** Zet de minimale opzet neer (server-instantie, doorgeefroute, client) en maak via `auth.signUp.email` een testaccount op de testbranch.
- [ ] **Stap 3:** Noteer het type van `session.user.id` en van `neon_auth`'s gebruikers-id (tekst of uuid).
- [ ] **Stap 4:** Probeer wachtwoordherstel vanuit eigen code: aanvragen (Better Auth `requestPasswordReset` met `redirectTo` naar `/wachtwoord-herstellen`) en afronden (`resetPassword` met token en nieuw wachtwoord). Komt de mail aan via de gedeelde afzender? Werkt de link?
- [ ] **Stap 5:** Probeer `changePassword` (huidig + nieuw wachtwoord) voor een ingelogde gebruiker.
- [ ] **Stap 6:** Probeer rechtstreeks registreren op het adres in `NEON_AUTH_BASE_URL`, buiten de app om. Noteer of dat kan (bevestigt waarom `members` nodig is).
- [ ] **Stap 7:** Schrijf de bevindingen onder "Bevindingen proef" onderaan dit plan. Werkt stap 4 niet: stop en leg Volkan de keuze voor (kant-en-klare Neon-schermen voor die twee pagina's). Werkt stap 5 niet: de optie "Wachtwoord wijzigen" verwijst naar "Wachtwoord vergeten".
- [ ] **Stap 8:** Gooi de proefcode weg (`git restore`/`git clean` alleen op de proefbestanden); de dependency blijft. Commit: `chore: add Neon Auth SDK`.

### Taak 2: Schema en migratie 1

**Files:** Modify `lib/schema.ts`; Create `drizzle/0006_*.sql` (via `npx drizzle-kit generate`); Modify `tests/setup.ts`; Test `tests/db.test.ts`.

**Interfaces — Produces:**
- `links.userId` — kolom `user_id`, type volgens taak 1, nu nog optioneel, met index `links_user_id_idx`.
- `members` — `userId` (primaire sleutel), `createdAt`.
- `shareTokens` — `userId` (primaire sleutel), `tokenHash` (uniek), `createdAt`.

- [ ] **Stap 1:** Test in `tests/db.test.ts`: een link met `userId: 'user-a'` invoegen en teruglezen; een rij in `members` en `shareTokens` invoegen; een tweede `shareTokens`-rij met dezelfde `tokenHash` faalt.
- [ ] **Stap 2:** Draai de test; verwacht FAIL (kolom/tabellen bestaan niet).
- [ ] **Stap 3:** Voeg de kolom en tabellen toe aan `lib/schema.ts`; genereer de migratie. `site_password` blijft staan.
- [ ] **Stap 4:** `tests/setup.ts`: `truncateLinks` leegt ook `members` en `shareTokens`.
- [ ] **Stap 5:** Draai `npx vitest run`; verwacht PASS.
- [ ] **Stap 6:** Commit: `feat: schema for link owners, members and share tokens`. De migratie nog niet op een database draaien.

### Taak 3: Sessie en lidmaatschap

**Files:** Create `lib/auth/server.ts`, `lib/auth/client.ts`, `app/api/auth/[...path]/route.ts`, `lib/members.ts`, `lib/currentUser.ts`; Test `tests/members.test.ts`, `tests/currentUser.test.ts`.

**Interfaces — Produces:**
- `auth` (server) en `authClient` (browser), volgens de opzet uit taak 1.
- `addMember(userId: string): Promise<void>` — idempotent.
- `isMember(userId: string): Promise<boolean>`.
- `getUserId(): Promise<string | null>` — het id van de ingelogde gebruiker, alleen als die in `members` staat; anders `null`.
- `getSessionUserId(): Promise<string | null>` — het id uit de sessie zonder lidmaatschapscontrole (voor `/geen-toegang` en registratie).

- [ ] **Stap 1:** Tests `tests/members.test.ts`: `isMember` is `false` voor een onbekend id; na `addMember` `true`; twee keer `addMember` geeft geen fout.
- [ ] **Stap 2:** Tests `tests/currentUser.test.ts` (met `vi.mock('@/lib/auth/server')`): geen sessie → `null`; sessie van een niet-lid → `null`; sessie van een lid → dat id.
- [ ] **Stap 3:** Draai; verwacht FAIL.
- [ ] **Stap 4:** Implementeer de vijf bestanden.
- [ ] **Stap 5:** Draai; verwacht PASS. Commit: `feat: session lookup and membership`.

### Taak 4: Data per gebruiker

**Files:** Modify `lib/links.ts`, `lib/processLink.ts`, `app/page.tsx`, `app/api/links/route.ts`, `app/api/links/[id]/route.ts`, `app/api/links/[id]/content/route.ts`, `app/api/links/[id]/notes/route.ts`, `app/api/links/[id]/notes/[noteId]/route.ts`, `app/api/links/[id]/highlights/route.ts`, `app/api/links/[id]/highlights/[highlightId]/route.ts`, `app/api/links/[id]/reprocess/route.ts`, `app/api/links/recategorize/route.ts`, `app/api/links/refresh-reader/route.ts`, `app/api/categories/route.ts`, `app/api/tags/route.ts`; Create `tests/helpers/user.ts`, `tests/isolation.test.ts`; Modify de bestaande `tests/api.*.test.ts` en `tests/processLink.test.ts`.

**Interfaces — Consumes:** `getUserId()` (taak 3), `links.userId` (taak 2).

**Interfaces — Produces:**
- `getLinks(userId: string, filters): Promise<LinkRow[]>`
- `getCategoriesByUsage(userId: string): Promise<string[]>`
- `getTagsByUsage(userId: string): Promise<string[]>`
- `ownedLink(userId: string, id: string)` — Drizzle-voorwaarde `id = … AND user_id = …`, gebruikt in elke `where` op één link.
- Testhulp `signInAs(userId: string | null)` in `tests/helpers/user.ts`: zet wat de gemockte `getUserId()` teruggeeft.

- [ ] **Stap 1:** Schrijf `tests/isolation.test.ts`. Opzet: een link van `user-a` en een van `user-b`. Tests:
  - `GET /api/links`, `/api/categories`, `/api/tags` als `user-a` tonen alleen A's data.
  - Voor elke `[id]`-route (PATCH, DELETE, content, notes POST, notes DELETE, highlights POST, highlights DELETE, reprocess): als `user-a` met B's link-id → status 404 en B's rij is ongewijzigd.
  - Elke route met `signInAs(null)` → 401.
  - `POST /api/links` als `user-a` slaat de link op met `userId: 'user-a'`.
  - `recategorize` en `refresh-reader` als `user-a` raken B's link niet (`updatedAt` van B ongewijzigd).
  - `processLink` voor A's link roept de AI aan met alleen A's categorieën (B heeft categorie `Alleen-B`; die zit niet in de meegegeven lijst).
- [ ] **Stap 2:** Draai; verwacht FAIL.
- [ ] **Stap 3:** Pas `lib/links.ts` aan (verplichte `userId` als eerste parameter, `ownedLink`).
- [ ] **Stap 4:** Pas elke route aan: bovenaan `const userId = await getUserId(); if (!userId) return 401`; elke query via `ownedLink` of een filter op `userId`. `content/route.ts` controleert eerst het eigendom van de link.
- [ ] **Stap 5:** `lib/processLink.ts`: lees `row.userId` en geef die door aan `getCategoriesByUsage`. Een link zonder eigenaar (oude data vóór de claim) krijgt een lege categorielijst.
- [ ] **Stap 6:** `app/page.tsx`: `getUserId()`; bij `null` met sessie → `redirect('/geen-toegang')`, zonder sessie → `redirect('/login')`.
- [ ] **Stap 7:** Werk de bestaande API-tests bij: `signInAs('user-a')` in de opzet en `userId` bij ingevoegde links.
- [ ] **Stap 8:** Draai `npx vitest run` en `npx tsc --noEmit`; verwacht PASS. Commit: `feat: links, categories and tags are scoped to their owner`.

### Taak 5: Opslaan-token per gebruiker

**Files:** Create `lib/shareTokens.ts`, `app/api/share-token/route.ts`; Modify `app/api/share/route.ts`; Test `tests/shareTokens.test.ts`, `tests/api.share.test.ts`, `tests/api.shareToken.test.ts`.

**Interfaces — Produces:**
- `createShareToken(userId: string): Promise<string>` — maakt een willekeurig token (32 bytes, base64url), bewaart alleen de SHA-256, vervangt een bestaand token, geeft het leesbare token één keer terug.
- `userIdForShareToken(token: string): Promise<string | null>` — `null` als het token onbekend is of de gebruiker geen lid meer is.
- `hasShareToken(userId: string): Promise<boolean>`.
- `GET /api/share-token` → `{ exists: boolean }`; `POST /api/share-token` → `{ token: string }`. Beide 401 zonder `getUserId()`.

- [ ] **Stap 1:** Tests: nieuw token is op te zoeken; in de database staat niet het leesbare token; na een tweede `createShareToken` geeft het eerste token `null`; leeg en onbekend token geven `null`; token van een gebruiker die niet in `members` staat geeft `null`.
- [ ] **Stap 2:** `tests/api.share.test.ts` ombouwen: het token komt van `createShareToken('user-a')`; de opgeslagen link heeft `userId: 'user-a'`; fout, leeg of ontbrekend token → 401 en niets opgeslagen; `API_TOKEN` in de omgeving geeft geen toegang meer.
- [ ] **Stap 3:** Draai; verwacht FAIL. Implementeer. Draai; verwacht PASS.
- [ ] **Stap 4:** Commit: `feat: personal share tokens`.

### Taak 6: Registreren met uitnodigingscode

**Files:** Create `lib/invite.ts`, `app/registreren/page.tsx`, `app/registreren/RegisterForm.tsx`, `app/registreren/actions.ts`, `app/geen-toegang/page.tsx`; Test `tests/invite.test.ts`, `tests/register.test.ts`, `tests/RegisterForm.test.tsx`.

**Interfaces — Consumes:** `auth` (taak 3), `addMember` (taak 3).

**Interfaces — Produces:**
- `isValidInviteCode(code: unknown): boolean` — vergelijkt met `process.env.INVITE_CODE` in constante tijd; `false` als de variabele ontbreekt of leeg is.
- `register(input: { name: string; email: string; password: string; inviteCode: string }): Promise<{ ok: true } | { ok: false; error: string }>` — serveractie.

- [ ] **Stap 1:** Tests `tests/invite.test.ts`: juiste code → `true`; foute code, lege code, niet-tekst, en ontbrekende of lege `INVITE_CODE` → `false`.
- [ ] **Stap 2:** Tests `tests/register.test.ts` (Neon Auth gemockt):
  - foute code → `{ ok: false, error: 'Uitnodigingscode klopt niet' }` en `auth.signUp.email` is niet aangeroepen;
  - wachtwoord korter dan 8 → fout, geen aanroep;
  - juiste code → `signUp.email` aangeroepen en het nieuwe id staat in `members`;
  - Neon geeft een fout (bijvoorbeeld adres bestaat al) → `{ ok: false, error: 'Account aanmaken is niet gelukt' }`, niets in `members`.
- [ ] **Stap 3:** Draai; verwacht FAIL. Implementeer `lib/invite.ts` en `actions.ts`.
- [ ] **Stap 4:** `RegisterForm.tsx`: velden Naam, E-mailadres, Wachtwoord, Uitnodigingscode; knop "Account aanmaken"; link "Al een account? Inloggen". Hergebruik `app/login/login.module.css`. Test: fout van de actie verschijnt in een `role="alert"`; bij succes navigatie naar `/`.
- [ ] **Stap 5:** `app/geen-toegang/page.tsx`: tekst "Dit account heeft nog geen toegang. Je hebt een uitnodigingscode nodig.", een veld voor de code (roept een actie aan die bij een juiste code `addMember(sessie-id)` doet) en een uitlogknop.
- [ ] **Stap 6:** Draai alles; verwacht PASS. Commit: `feat: sign up with an invite code`.

### Taak 7: Inloggen, uitloggen, proxy; oude inlog weg

**Files:** Modify `app/login/LoginForm.tsx`, `proxy.ts`, `app/components/LinksBrowser.tsx` (alleen `confirmLogout`), `tests/LoginForm.test.tsx`, `tests/proxy.test.ts`, `.env.example`. Verwijderen: `lib/session.ts`, `lib/password.ts`, `lib/auth.ts`, `app/api/login/`, `app/api/logout/`, `app/api/password/`, `tests/session.test.ts`, `tests/password.test.ts`, `tests/auth.test.ts`, `tests/api.login.test.ts`.

- [ ] **Stap 1:** Leg de lijst te verwijderen bestanden aan Volkan voor en wacht op akkoord.
- [ ] **Stap 2:** Tests `tests/LoginForm.test.tsx`: veld "E-mailadres" in plaats van "Gebruikersnaam"; verkeerde gegevens → "Onjuist e-mailadres of wachtwoord"; links "Account aanmaken" (`/registreren`) en "Wachtwoord vergeten?" (`/wachtwoord-vergeten`) aanwezig; succes → navigatie naar `/`.
- [ ] **Stap 3:** Tests `tests/proxy.test.ts` (Neon Auth gemockt): zonder sessie `/` → redirect `/login`; `/login`, `/registreren`, `/wachtwoord-vergeten`, `/wachtwoord-herstellen`, `/geen-toegang`, `/api/auth/x`, `/api/share` zijn zonder sessie bereikbaar; `/api/links` zonder sessie → 401; met sessie gaat `/` door.
- [ ] **Stap 4:** Draai; verwacht FAIL. Implementeer: `LoginForm` gebruikt `authClient.signIn.email`; `proxy.ts` gebruikt de sessiecontrole van Neon Auth met de matcher uit stap 3; `confirmLogout` gebruikt `authClient.signOut()`.
- [ ] **Stap 5:** Verwijder de bestanden uit stap 1. `.env.example`: `SITE_USERNAME`, `SITE_PASSWORD`, `SESSION_SECRET`, `API_TOKEN` eruit; `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `INVITE_CODE` erin.
- [ ] **Stap 6:** Draai `npx vitest run`, `npx tsc --noEmit`, `npx eslint`; verwacht schoon. Commit: `feat: sign in with Neon Auth; remove single-user login`.

### Taak 8: Wachtwoord vergeten, herstellen en wijzigen

Uitvoering volgens de bevindingen van taak 1.

**Files:** Create `app/wachtwoord-vergeten/page.tsx` + `ForgotForm.tsx`, `app/wachtwoord-herstellen/page.tsx` + `ResetForm.tsx`; Modify `app/components/LinksBrowser.tsx` (alleen `savePassword`); Test `tests/ForgotForm.test.tsx`, `tests/ResetForm.test.tsx`.

- [ ] **Stap 1:** Tests `ForgotForm`: na versturen altijd "Als dit adres bij ons bekend is, staat er een mail met een herstellink in je inbox. De link is 15 minuten geldig." — ook als de aanroep een fout voor een onbekend adres geeft; alleen bij een netwerkfout "Geen verbinding, probeer het opnieuw".
- [ ] **Stap 2:** Tests `ResetForm`: twee wachtwoordvelden; ongelijk → "De wachtwoorden zijn niet gelijk"; korter dan 8 → melding; ontbrekend of verlopen token → "Deze link is verlopen. Vraag een nieuwe aan." met link naar `/wachtwoord-vergeten`; succes → navigatie naar `/`.
- [ ] **Stap 3:** Draai; verwacht FAIL. Implementeer beide schermen met `login.module.css`.
- [ ] **Stap 4:** `savePassword` in `LinksBrowser.tsx`: via `authClient.changePassword` als taak 1 dat bevestigde; anders vervangt een link naar `/wachtwoord-vergeten` het wachtwoordblad (wijziging aan bestaande interface: eerst aan Volkan melden).
- [ ] **Stap 5:** Draai alles; verwacht PASS. Commit: `feat: forgot, reset and change password`.

### Taak 9: Token in het instellingenmenu

**Files:** Modify `app/components/LinksBrowser.tsx`, `app/components/LinksBrowser.module.css`, `tests/LinksBrowser.test.tsx`.

**Interfaces — Consumes:** `GET`/`POST /api/share-token` (taak 5).

- [ ] **Stap 1:** Tests: menu-item "Token voor opslaan-snelkoppeling" opent een blad; zonder token knop "Token maken", met token knop "Token vervangen" plus de waarschuwing "Het oude token werkt daarna niet meer"; na maken is het token zichtbaar met knop "Kopieer" en de tekst "Je ziet dit token maar één keer."
- [ ] **Stap 2:** Draai; verwacht FAIL. Implementeer naar het voorbeeld van het bestaande wachtwoordblad. Draai; verwacht PASS.
- [ ] **Stap 3:** Commit: `feat: share token in settings`.

### Taak 10: Claim-script

**Files:** Create `scripts/claim-links.ts`, `lib/claimLinks.ts`; Test `tests/claimLinks.test.ts`.

**Interfaces — Produces:**
- `countUnownedLinks(): Promise<number>`
- `claimUnownedLinks(userId: string): Promise<number>` — zet `user_id` op alle links zonder eigenaar; weigert als `userId` geen lid is.
- `scripts/claim-links.ts <e-mailadres>`: zoekt het id bij het adres in `neon_auth`, toont de host uit `DATABASE_URL` en het aantal te koppelen links, en voert pas uit met de vlag `--bevestig`.

- [ ] **Stap 1:** Tests: links zonder eigenaar krijgen het id; links van een ander blijven ongemoeid; geen lid → fout en niets gewijzigd; tweede keer draaien wijzigt 0 rijen.
- [ ] **Stap 2:** Draai; verwacht FAIL. Implementeer. Draai; verwacht PASS. Commit: `feat: script to claim existing links`.

### Taak 11: Proefdraaien op de testbranch

Elke stap die een database raakt: eerst akkoord van Volkan.

- [ ] **Stap 1:** `npx drizzle-kit migrate` tegen de testbranch (migratie 1).
- [ ] **Stap 2:** `npm run dev`; doorloop met de hand: registreren met foute en juiste code, inloggen, link opslaan, uitloggen, wachtwoord vergeten met echte mail, herstellen, token maken en via `curl` naar `/api/share` opslaan, tweede account ziet niets van het eerste.
- [ ] **Stap 3:** Claim-script op de testbranch voor Volkans testaccount; controleer dat zijn bestaande links verschijnen.
- [ ] **Stap 4:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint`, `npm run build`. Meld Volkan de uitkomsten, inclusief wat niet werkte.

### Taak 12: Overgang naar productie (met Volkan, stap voor stap akkoord)

- [ ] Neon-console (productiebranch): "Sign-in with Email" aan, applicatienaam "Instavol", productiedomein bij de vertrouwde domeinen.
- [ ] Vercel: `NEON_AUTH_COOKIE_SECRET` en `INVITE_CODE` toevoegen.
- [ ] Migratie 1 op productie.
- [ ] Branch samenvoegen en deployen.
- [ ] Volkan registreert; claim-script op productie met zijn adres; hij controleert zijn links.
- [ ] Volkan maakt een token en zet het in zijn snelkoppeling.
- [ ] `HANDOFF.md` bijwerken (omgevingsvariabelen, inlog, token).

### Taak 13: Opruimen na de overgang (aparte, latere wijziging)

- [ ] Migratie 2: `links.user_id` verplicht, tabel `site_password` weg. Pas nadat op productie geen link zonder eigenaar meer bestaat. Het verwijderen van de tabel eerst aan Volkan voorleggen.
- [ ] Vercel: `SITE_USERNAME`, `SITE_PASSWORD`, `SESSION_SECRET`, `API_TOKEN` verwijderen.
- [ ] Testbranch `accounts-test` verwijderen.

---

## Bevindingen proef

(In te vullen in taak 1.)
