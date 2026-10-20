# Instavol — persoonlijke "bewaar interessante websites" app

## Intent en waarom

Volkan wil, op het moment dat hij op zijn iPhone of Mac een interessante
website tegenkomt, die meteen kunnen bewaren vanuit Safari's eigen
deelmenu — zonder een link te hoeven kopiëren en ergens te plakken. De
app moet zelf een korte samenvatting van de pagina maken en de pagina
automatisch in een categorie onderbrengen, zodat er na verloop van tijd
een doorzoekbare, overzichtelijke verzameling ontstaat — vergelijkbaar
met hoe Instapaper voelt, maar dan met automatische samenvatting en
categorisering in plaats van alleen "lees het later".

Succes betekent: opslaan voelt net zo snel en vanzelfsprekend als met
Instapaper, en na een paar weken gebruik is de verzameling nog steeds
prettig te doorzoeken omdat de categorieën logisch blijven in plaats van
te verwateren in tientallen bijna-identieke varianten.

## Scope nu

- Eén gebruiker (Volkan). Geen inlog voor meerdere mensen, geen delen met
  anderen. Dat is een bewuste keuze: "dat komt later, zorg eerst dat dit
  perfect werkt."
- Opslaan werkt vanaf: Safari op iPhone (iOS) en Safari op Mac (macOS),
  allebei via het ingebouwde deel-icoon.
- Bekijken/doorzoeken werkt vanaf: een website, bruikbaar in elke browser
  op elk apparaat.

## Non-goals (nu bewust niet)

- Geen ondersteuning voor meerdere gebruikers of accounts.
- Geen deelfunctie richting andere mensen.
- Geen extensies voor andere browsers dan Safari (geen Chrome/Firefox) —
  Volkan gebruikt alleen Safari.
- Geen los mobiel/desktop "lees-later"-app met eigen UI om artikelen te
  lezen; het lezen gebeurt gewoon op de originele site, deze app is er
  alleen om te bewaren, samen te vatten en terug te vinden.

## Anti-goals (dit zou een mislukking zijn, ook als het technisch werkt)

- Opslaan voelt traag of onzeker aan (bijv. moeten wachten tot een AI
  klaar is voor je het deelvenster kan sluiten).
- Categorieën ontploffen in tientallen bijna-identieke varianten
  ("Tech", "Technologie", "Technology", "Tech nieuws", ...) waardoor
  filteren nutteloos wordt.
- De website is niet bruikbaar vanaf een andere laptop/telefoon dan
  Volkans eigen apparaten (dus: geen lokale-only oplossing die alleen op
  zijn Mac draait).

## Hoe het werkt (gebruikersflow)

1. Volkan opent een interessante pagina in Safari (iPhone of Mac).
2. Hij tikt op het deel-icoon en kiest de "Bewaar in Instavol"-extensie.
3. Hij ziet meteen een bevestigingsschermpje (zoals bij Instapaper) dat
   laat zien dat het is opgeslagen, en sluit dat vervolgens.
4. Op de achtergrond haalt de server de pagina op, laat een AI er een
   korte samenvatting van maken en kiest (of bedenkt) een categorie.
5. Volkan bekijkt, doorzoekt en filtert zijn bewaarde links later op de
   website, met titel, samenvatting en categorie erbij.

## Vragen na reviewer-check, beantwoord door Volkan

- **Categorieën achteraf aanpassen:** niet nodig nu. Een puur automatisch
  systeem zonder handmatige correctiemogelijkheid (hernoemen/samenvoegen
  van categorieën, item verplaatsen) is voor nu prima. Kan later worden
  toegevoegd als het in de praktijk nodig blijkt.
- **Apple Developer-account (~99 dollar/jaar) voor het stabiel houden van
  de Safari Share Extension:** Volkan wil eerst zien hoe de app werkt
  voordat hij hierover beslist. Dat betekent: voor de eerste versie bouwen
  en installeren we de extensie via een gratis (onbetaald) Apple-account,
  wat inhoudt dat de installatie op zijn iPhone/Mac na ongeveer 7 dagen
  verloopt en dan handmatig opnieuw geïnstalleerd moet worden via Xcode.
  Dat is voor de testfase geaccepteerd. Zodra blijkt dat de app bevalt,
  neemt Volkan een besluit over het betaalde account voor duurzaam
  gebruik.
- (Kort overwogen en weer losgelaten: eerst een Chrome-extensie bouwen in
  plaats van de Safari-aanpak. Volkan is hierop teruggekomen — het blijft
  bij Safari op iPhone en Mac, zoals hierboven beschreven.)

## Beslissingen die al vastliggen (uit het gesprek)

- **Opslaan:** via een native Safari Share Extension, zowel voor iOS als
  macOS (dit vereist een Xcode-project met Swift/SwiftUI — geen
  webtechniek kan het systeem-deelmenu van Safari uitbreiden).
- **Samenvatting:** volledig automatisch, Volkan typt niets zelf in.
- **Categorisering:** volledig automatisch; geen vaste lijst vooraf. De
  app mag zelf nieuwe categorieën aanmaken naarmate er meer wordt
  bewaard.
- **Bekijken:** een website, geen native app, geen browserextensie nodig
  om te bekijken.
- **Gebruikers:** alleen Volkan, geen multi-user systeem (nu).
- **Hosting:** Volkan heeft dit expliciet aan mij overgelaten ("maak een
  praktische/eenvoudige keuze").

## Beslissingen die ik heb gemaakt (mijn keuze, ter info — niet door
Volkan expliciet gevraagd, maar wel besproken als "zijn jouw keuze")

- **Techstack/hosting:** Eén Next.js-applicatie (website + API-routes in
  één project) op Vercel, met een Postgres-database (Neon, via Vercel's
  eigen integratie). Reden: dit is op dit moment de meest praktische
  combinatie voor een klein eenpersoonsproject — één deploy, geen losse
  server om te onderhouden, gratis tier is ruim voldoende voor persoonlijk
  gebruik, en de Share Extension kan gewoon tegen de API-routes van
  dezelfde app praten.
- **AI:** de Google Gemini API (gratis tier, bijv. `gemini-1.5-flash` of
  de actuele gratis-tier-variant) voor het samenvatten van de paginatekst
  en het kiezen/aanmaken van een categorie. Reden: Volkan wil geen
  terugkerende kosten, en de Claude API heeft geen permanent gratis tier.
  Gemini's gratis tier heeft wel rate limits (aantal verzoeken per
  minuut/dag), maar die zijn ruim voldoende voor incidenteel persoonlijk
  gebruik (een paar opgeslagen links per dag). Bij het categoriseren
  krijgt het model de lijst van bestaande categorieën mee, met de
  instructie om een bestaande te hergebruiken als die logisch past, en
  alleen een nieuwe te verzinnen als dat echt beter past. Dit is de
  maatregel tegen het "ontploffen" van categorieën uit de anti-goals.
  Risico om in de gaten te houden: als het gratis quotum ooit structureel
  knelt, is overstappen naar een andere aanbieder nodig — de AI-aanroep
  wordt daarom als één losse, makkelijk vervangbare module gebouwd.
- **Asynchrone verwerking:** de Share Extension stuurt alleen de URL
  (plus paginatitel, die Safari al meegeeft) naar de server en toont
  meteen de bevestiging — net zo snel als Instapaper. Het ophalen van de
  pagina, samenvatten en categoriseren gebeurt op de achtergrond op de
  server; dit kan een paar seconden duren en moet de deelactie niet
  ophouden. Op de website staat een item in een "wordt verwerkt"-status
  totdat samenvatting en categorie binnen zijn.
- **Eén categorie per link** (geen meerdere tags per item), omdat Volkan
  sprak over "een categorie" in enkelvoud. Dit is relatief eenvoudig
  later uit te breiden naar meerdere tags als dat gewenst blijkt.
- **Authenticatie nu:** een simpel gedeeld geheim (API-token) waarmee de
  Share Extension zich identificeert bij de server, en een simpele
  wachtwoord-achtige toegang tot de website — geen volwaardig
  account-systeem, omdat er maar één gebruiker is. Dit moet later
  makkelijk te vervangen zijn zodra er wel meerdere gebruikers bijkomen.

## Wat ik nog niet weet / wat ik aan de bouwer overlaat

- Hoe om te gaan met pagina's die niet goed op te halen zijn (JavaScript-
  zware sites, paywalls, inlog vereist): voorstel is om dan in elk geval
  titel + URL te bewaren, met een duidelijke status dat samenvatting/
  categorie niet konden worden gemaakt, in plaats van de hele opslag te
  laten mislukken.
- Wat er gebeurt als dezelfde URL twee keer wordt bewaard (negeren,
  vervangen, of als los duplicaat bewaren).
- Exact datamodel (welke velden precies: bewaar-datum, domein, favicon/
  voorbeeldafbeelding, leestijd-schatting, etc.) — mag de bouwer
  invullen zolang titel, URL, samenvatting, categorie en bewaar-datum
  erin zitten.
- Exacte prompt-tekst richting Claude voor samenvatting/categorisering.
- Vormgeving van het bevestigingsschermpje in de Share Extension en van
  de website (lijst-/kaartweergave, filter- en zoekervaring) — mag de
  bouwer een praktisch, opgeruimd ontwerp voor kiezen.
- Exacte structuur van het Xcode-project (bundle identifiers, of de
  macOS- en iOS-extensie code delen via een gedeeld framework-target).

## Vervolgstap

Na akkoord op dit document volgt een gedetailleerd implementatieplan
(architectuur, datamodel, API-contract, stappenplan) voordat er code
geschreven wordt.
