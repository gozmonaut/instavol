# Instavol — hand-off naar VS Code / deployment

## Status

Backend + website (Plan A) zijn volledig gebouwd, getest en gereviewd:
60/60 tests groen, `tsc`/`eslint` schoon, `next build` werkt met correcte
dynamische rendering. Niets staat nog open behalve de daadwerkelijke
deployment (hieronder). Laatste commit: `46150db`.

Volledige achtergrond:
- Ontwerp: [docs/superpowers/specs/2026-10-20-save-site-app-design.md](docs/superpowers/specs/2026-10-20-save-site-app-design.md)
- Bouwplan (incl. exacte Task 11-stappen): [docs/superpowers/plans/2026-10-20-instavol-backend-website.md](docs/superpowers/plans/2026-10-20-instavol-backend-website.md) (zie "Task 11: Deploy to Vercel and Neon" onderaan)

De Safari Share Extension (iOS + macOS, om vanaf je telefoon/Mac op te
slaan) is een apart, nog niet gebouwd plan ("Plan B") — deze repo bevat
alleen de backend/website waar die extensie straks tegenaan praat.

## Volgende stappen (deployment)

1. **Repo naar GitHub**: push deze map vanuit VS Code naar je eigen
   GitHub-repo.
2. **Vercel-project aanmaken** vanuit die repo (je hebt al een account).
3. **Neon-database**: via Vercel's eigen Neon-integratie (makkelijkst,
   koppelt `DATABASE_URL` automatisch) of los via neon.tech.
4. **Env vars instellen in Vercel** (zie `.env.example` voor de lijst):
   - `DATABASE_URL` — van Neon
   - `API_TOKEN` — zelf verzinnen, een lang willekeurig geheim (dit is de
     sleutel waarmee de toekomstige Safari-extensie zich straks
     identificeert bij `/api/share`)
   - `SITE_USERNAME` / `SITE_PASSWORD` — voor de Basic Auth op de website
   - `GEMINI_API_KEY` — gratis sleutel via aistudio.google.com
   - `GEMINI_MODEL` — **controleer eerst welk Gemini-model nog actief is
     op de gratis tier** voordat je deployt; het model dat in de code als
     standaard staat (`gemini-1.5-flash`) is mogelijk inmiddels uitgefaseerd
     door Google. Zet het juiste model-ID hier in.
5. **Database-migratie toepassen** tegen de Neon-database:
   ```bash
   npx drizzle-kit migrate
   ```
   (vereist `DATABASE_URL` lokaal beschikbaar, bijv. via een tijdelijke
   `.env` die je niet commit — `.env` staat al in `.gitignore`.)
6. **Deploy**, en verifieer end-to-end:
   ```bash
   curl -i -X POST https://<jouw-deployment-url>/api/share \
     -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
     -d '{"url":"https://example.com"}'
   # verwacht: 201

   curl -s -u "$SITE_USERNAME:$SITE_PASSWORD" https://<jouw-deployment-url>/api/links
   # verwacht: het item hierboven, na een paar seconden status "done" met
   # samenvatting + categorie (of "failed" met een duidelijke foutmelding)
   ```

## Bekende openstaande kleinigheden (niet blokkerend)

Niets hiervan houdt een werkende deployment tegen; het zijn
verbeterpunten uit de reviews die bewust niet meteen zijn opgelost:

- **Beveiliging/hardening**: de Gemini API-sleutel gaat mee in de
  query-string van het verzoek (`lib/gemini.ts`) in plaats van een
  header — kan later verplaatst worden naar de `x-goog-api-key` header.
  Ook zijn de token/wachtwoord-vergelijkingen in `lib/auth.ts` niet
  "constant-time" (timing-aanval-risico, laag bij een eenpersoonsapp).
- **DNS-rebinding**: de SSRF-bescherming in `lib/extractPage.ts` checkt
  het IP-adres vóór het ophalen, maar niet op het exacte moment van
  ophalen zelf — een zeer onwaarschijnlijke edge case.
- **Foutmeldingen zijn soms rauwe Engelse technische tekst** (bijv.
  "Mislukt: fetch failed") in plaats van een nette Nederlandse melding.
- **Categorie-normalisatie**: alleen de AI-prompt voorkomt bijna-dubbele
  categorieën; er is geen code-side check die bijvoorbeeld "tech" en
  "Tech" automatisch samenvoegt.
- **UI-kleinigheden**: tijdzone bij datums kan server/client verschillen
  tonen vóór hydratatie; een opnieuw-verwerken-klik op een item dat al
  "pending" is kan een dubbele AI-aanroep veroorzaken; geen laad-foutmelding
  als een API-aanroep vanuit de website zelf mislukt (bijv. bij een
  tijdelijke netwerkstoring).
- **npm audit**: bij scaffolding meldde npm een aantal high-severity
  kwetsbaarheden in de dependency-boom (standaard create-next-app-output).
  Nog niet nagelopen — doe dit voor je live gaat: `npm audit`.

Geen van deze is urgent; pak ze op wanneer het je uitkomt.
