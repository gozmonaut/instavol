# Instavol — accounts voor meerdere gebruikers

Status: concept, wacht op akkoord van Volkan.

## Intent en waarom

Instavol is gebouwd voor één persoon: één gebruikersnaam en wachtwoord uit
de omgevingsvariabelen, en één gedeelde verzameling links. Volkan wil dat
zijn familie de app ook kan gebruiken. Ieder krijgt een eigen account en
een eigen, afgeschermde verzameling. Mensen moeten zelf een account kunnen
aanmaken en zelf hun wachtwoord kunnen herstellen, zonder dat Volkan daar
iets voor hoeft te doen.

Volkan vroeg uitdrukkelijk om de simpelste oplossing. Dat weegt zwaarder
dan volledigheid of flexibiliteit.

## Goals

- Iemand met de uitnodigingscode maakt zelf een account aan (naam,
  e-mailadres, wachtwoord).
- Inloggen met e-mailadres en wachtwoord.
- Wachtwoord vergeten: herstelmail met link, daarna nieuw wachtwoord
  kiezen.
- Elke gebruiker ziet en bewerkt alleen de eigen links, notities,
  highlights, tags en categorieën.
- Elke gebruiker kan vanuit het deelmenu opslaan naar het eigen account.
- Volkans bestaande links blijven behouden en komen onder zijn account.

## Non-goals

- Links delen tussen gebruikers of een gezamenlijke verzameling.
- Beheerscherm in de app (gebruikers bekijken of verwijderen gaat via de
  Neon-console).
- Inloggen via Google/GitHub, tweestapsverificatie, passkeys.
- E-mailverificatie bij registratie.
- Limieten per gebruiker op AI-gebruik.
- Account zelf verwijderen, e-mailadres wijzigen.
- Eigen opmaak van de mails.

## Anti-goals

- Een gebruiker kan de data van een ander zien of wijzigen, ook niet door
  een id te raden.
- Een vreemde kan zonder uitnodigingscode een account aanmaken en zo
  Volkans Gemini-sleutel gebruiken.
- Volkans bestaande links raken kwijt of komen bij iemand anders terecht.

## Constraints

- Bestaande stack: Next.js 16.4 (App Router, `proxy.ts`), Drizzle, Neon
  Postgres via de Vercel-integratie, Vitest met PGlite.
- `AGENTS.md`: deze Next.js-versie wijkt af van eerdere; lees de gids in
  `node_modules/next/dist/docs/` voordat je code schrijft.
- Neon Auth staat al aan op de database (`NEON_AUTH_BASE_URL` staat in
  `.env.local`). De database draait op AWS, wat Neon Auth vereist.
- Interfacetekst is Nederlands, in de bestaande stijl (CSS modules, geen
  Tailwind).
- Migraties, omgevingsvariabelen in Vercel, instellingen in de
  Neon-console en deployen gebeuren alleen na uitdrukkelijk akkoord van
  Volkan in het gesprek.

## Aanpakken

1. **Neon Auth** (beheerde Better Auth bij de bestaande database).
   Registreren, inloggen, sessies en de herstelmail zijn kant-en-klaar;
   gebruikers staan in het schema `neon_auth` van de eigen database.
   Nadeel: afhankelijk van Neon, en een vaste set mogelijkheden.
2. **Better Auth zelf hosten** met een maildienst zoals Resend. Meer
   controle, maar zelf een maildienst en afzenderdomein regelen en meer
   configuratie.
3. **Zelf uitbouwen** op de bestaande scrypt- en sessiecode met een
   maildienst. Geen nieuwe auth-afhankelijkheid, maar de meeste eigen
   beveiligingsgevoelige code en alsnog een maildienst.

**Gekozen door Volkan: aanpak 1**, omdat die het minste eigen code vraagt
en aansluit op wat er al is.

## Ontwerp

### Inloggen en accounts

- Neon Auth met e-mail en wachtwoord. De server-instantie komt in
  `lib/auth/server.ts`, de doorgeefroute in `app/api/auth/[...path]/route.ts`,
  de browserclient in `lib/auth/client.ts`.
- Nieuwe omgevingsvariabele `NEON_AUTH_COOKIE_SECRET` (minstens 32 tekens).
- Schermen, in de stijl van het huidige inlogscherm:
  - `/login`: e-mailadres en wachtwoord, met links naar "Account aanmaken"
    en "Wachtwoord vergeten?".
  - `/registreren`: naam, e-mailadres, wachtwoord, uitnodigingscode.
  - `/wachtwoord-vergeten`: e-mailadres invullen. Toont altijd dezelfde
    bevestiging, ook als het adres onbekend is.
  - `/wachtwoord-herstellen`: de pagina waar de link uit de mail op
    uitkomt; nieuw wachtwoord kiezen. De link is 15 minuten geldig.
- `proxy.ts` stuurt niet-ingelogde bezoekers naar `/login`. De vier
  schermen hierboven, `/api/auth`, `/api/share` en de statische bestanden
  blijven openbaar. Elke API-route controleert daarnaast zelf de sessie en
  geeft 401 zonder sessie.
- Uitloggen blijft in het instellingenmenu en gaat via Neon Auth.

### Uitnodigingscode

- Eén gedeelde code in de omgevingsvariabele `INVITE_CODE`. Volkan geeft
  die aan familie.
- Registreren loopt via een eigen serveractie die eerst de code
  controleert en pas daarna het account bij Neon Auth aanmaakt.
- Zonder ingestelde `INVITE_CODE` is registreren dicht.
- Neon Auth heeft een eigen adres waar iemand mogelijk rechtstreeks een
  account kan aanmaken, buiten de app om. Een sessie alleen betekent dus
  niet "uitgenodigd". Daarom een eigen tabel `members` (`user_id`,
  `created_at`) die alleen de serveractie vult, na controle van de code.
  `requireUserId()` laat alleen gebruikers door die in `members` staan;
  een account zonder lidmaatschap krijgt 401 en ziet een melding dat een
  uitnodigingscode nodig is. `/api/share` en het claim-script vertrouwen
  ook alleen leden.

### Data per gebruiker

- `links` krijgt een kolom `user_id` (het id van de gebruiker in
  `neon_auth`) met een index.
- Eén hulpfunctie (bijvoorbeeld `requireUserId()` in `lib/currentUser.ts`)
  haalt de ingelogde gebruiker op. Alle routes onder `app/api/links`,
  `app/api/categories`, `app/api/tags`, `lib/links.ts` en `app/page.tsx`
  gebruiken die.
- Elke leesactie en elke wijziging filtert op `user_id`. Een link van een
  ander gedraagt zich als een link die niet bestaat (404).
- Categorieën en tags worden afgeleid uit links en zijn daardoor vanzelf
  per gebruiker. `lib/processLink.ts` geeft de AI alleen de bestaande
  categorieën van de eigenaar van de link mee. De batchroutes
  `recategorize` en `refresh-reader` werken alleen op de eigen links.
- `link_contents` hangt aan een link en wordt alleen via een
  eigenaarscontrole op de link uitgelezen.

### Opslaan vanuit het deelmenu

- Nieuwe tabel `share_tokens`: `user_id` (primaire sleutel),
  `token_hash` (SHA-256), `created_at`. Eén token per gebruiker.
- In het instellingenmenu: "Token voor de opslaan-snelkoppeling" met een
  knop om een token te maken of te vervangen. Het token is één keer
  zichtbaar, met een kopieerknop.
- `/api/share` zoekt de gebruiker bij het meegestuurde token en slaat de
  link onder die gebruiker op. Onbekend token geeft 401.
- Het gedeelde `API_TOKEN` vervalt. Volkan zet eenmalig zijn nieuwe token
  in zijn snelkoppeling.

### Bestaande data overzetten

1. Migratie 1: `user_id` toevoegen als optionele kolom, plus
   `share_tokens` en `members`.
2. Volkan maakt zijn account aan.
3. Eenmalig script (`scripts/claim-links.ts <e-mailadres>`) koppelt alle
   links zonder eigenaar aan dat account. Het script meldt vooraf hoeveel
   links het raakt.
4. Migratie 2: `user_id` verplicht maken en de tabel `site_password`
   verwijderen.

Tussen stap 1 en 3 ziet Volkan een lege lijst; er gaat niets verloren.

### Werkwijze en overgang

- Al het werk gebeurt op een aparte branch, niet op `main`, zodat de
  live app blijft werken tot de overgang.
- De overgang is één geordende reeks, elke stap na akkoord van Volkan:
  instellingen in Neon en Vercel, migratie 1, deploy, Volkan registreert,
  claim-script, migratie 2.
- OPEN (vraag aan Volkan): wijst `.env.local` naar de productiedatabase,
  en deployt een push naar `main` automatisch? Het antwoord bepaalt of er
  eerst een aparte Neon-testbranch nodig is voor de proef en de
  migraties.

### Wat vervalt

- `lib/session.ts`, `lib/password.ts`, `isValidBasicAuth` en
  `isValidApiToken` in `lib/auth.ts`, `app/api/login`, `app/api/logout`,
  `app/api/password`, de tabel `site_password`.
- Omgevingsvariabelen `SITE_USERNAME`, `SITE_PASSWORD`, `SESSION_SECRET`,
  `API_TOKEN`.
- De bijbehorende tests worden vervangen door tests voor het nieuwe
  gedrag.

### Mail

- Start met de gedeelde afzender van Neon (`auth@mail.myneon.app`). Die is
  volgens Neon bedoeld voor ontwikkelen en testen en heeft een limiet die
  de documentatie niet in cijfers noemt. Voor een handvol familieleden is
  het volume klein, maar mails kunnen in spam belanden.
- De productiechecklist van Neon zegt dat wachtwoordherstel werkt met de
  gedeelde én een eigen afzender. Alleen verificatielinks bij registratie
  vereisen een eigen afzender, en die gebruiken we niet. De proef
  bevestigt dit met een echte herstelmail.
- Een eigen afzender instellen is later een instelling in de Neon-console
  en vraagt geen codewijziging.

### Instellingen buiten de code (door Volkan, na akkoord)

- Neon-console: "Sign-in with Email" aan, applicatienaam "Instavol",
  productiedomein toevoegen aan de vertrouwde domeinen.
- Vercel: `NEON_AUTH_COOKIE_SECRET` en `INVITE_CODE` toevoegen; de
  vervallen variabelen verwijderen na een geslaagde overgang.

## Onzekerheden die de bouwer eerst uitzoekt

Deze punten zijn niet met zekerheid uit de documentatie te halen. De bouw
begint met een korte proef die ze beantwoordt.

1. **Pakketnaam.** De Neon-documentatie noemt `@neon/auth`, de
   Neon-skill noemt `@neondatabase/auth`. Controleer welke actueel is en
   Next 16.4 ondersteunt.
2. **Wachtwoordherstel vanuit eigen schermen.** De documentatie zegt dat
   de SDK-methoden hiervoor "not fully supported yet" zijn en verwijst
   naar kant-en-klare schermen. Proef: werkt het aanvragen en afronden van
   een herstel via de onderliggende Better Auth-aanroepen door de
   doorgeefroute? Zo ja, dan eigen schermen zoals hierboven. Zo nee, dan
   voor alleen deze twee schermen de kant-en-klare schermen van Neon, en
   dat eerst aan Volkan melden omdat ze er anders uitzien.
3. **Wachtwoord wijzigen terwijl je ingelogd bent.** Onduidelijk of
   Neon Auth dit ondersteunt. Zo ja, dan blijft de bestaande optie in het
   instellingenmenu werken via Neon Auth. Zo nee, dan vervalt die optie en
   verwijst het menu naar "Wachtwoord vergeten".
4. **Type van het gebruikers-id** in `neon_auth` (tekst of uuid). De kolom
   `user_id` volgt dat type.

## Aan de bouwer

- Geen verwijzing met een foreign key naar het schema `neon_auth`: dat
  schema bestaat niet in PGlite, waar de tests op draaien.
- Tests vervangen de sessie door `requireUserId()` te mocken. Voor elke
  route minstens één test dat een andere gebruiker de data niet ziet en
  niet kan wijzigen.
- Vormgeving van de nieuwe schermen en het tokenblok volgt het bestaande
  inlogscherm en instellingenmenu; details zijn aan de bouwer.
- Foutmeldingen in het Nederlands, zonder te verraden of een e-mailadres
  bestaat.
- De vergelijking van de uitnodigingscode en het opzoeken van het token
  gebeuren zonder timing-lek waar dat eenvoudig kan.
