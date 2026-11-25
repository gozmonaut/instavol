# Snelkoppeling "Bewaar in Instavol" (iPhone, iPad en Mac)

Met deze snelkoppeling bewaar je vanuit het deelmenu (en op de Mac via
rechtermuisklik → Voorzieningen) in Instavol:

| Wat je deelt | Wat Instavol bewaart |
|---|---|
| Safari-pagina | Link (Gemini vat samen en categoriseert) |
| Safari-pagina met geselecteerde tekst | Link, met de selectie als notitie |
| URL uit een andere app | Link |
| Foto('s) / afbeeldingen | Afbeelding(en) |
| Tekst / geselecteerde tekst | Losse notitie (categorie "Notities") |

Je bouwt hem één keer, bijvoorbeeld op de Mac; via iCloud verschijnt hij ook
op je iPhone en iPad.

> **Let op:** de actienamen hieronder zijn de Nederlandse namen zoals ik ze
> verwacht. Apple wijzigt die soms per iOS/macOS-versie. Heet een actie bij
> jou anders, zoek dan op het Engelse woord tussen haakjes.

---

## 1. Token aanmaken

1. Open Instavol en log in.
2. Ga naar **Instellingen → Token voor opslaan-snelkoppeling**.
3. Maak een token aan en kopieer hem. Hij wordt **maar één keer** getoond.
   Maak je later een nieuwe, dan werkt de oude niet meer en moet je hem in de
   snelkoppeling vervangen.

Het adres dat je nodig hebt is: `https://<jouw-domein>/api/share`

---

## 2. Snelkoppeling aanmaken

Open de app **Opdrachten** (Shortcuts), tik op **+** en noem hem
**Bewaar in Instavol**.

### Instellingen van de snelkoppeling

Open het infopaneel (ⓘ, of op de Mac het tabblad rechts):

- Zet **Toon in deelmenu** (Show in Share Sheet) aan.
- Zet bij de ontvangen typen alleen aan: **URL's, Safari-webpagina's,
  Afbeeldingen, Tekst, Opgemaakte tekst** (Rich text).
- Bij "Als er geen invoer is": kies **Vraag om tekst** (Ask For Text). Dan kun
  je hem ook vanaf je beginscherm starten om snel een notitie te typen.
- **Alleen op de Mac:** zet **Gebruik als snelle actie** (Use as Quick Action)
  aan, met **Voorzieningen-menu** (Services Menu) en **Finder** aangevinkt.
  Dan verschijnt hij bij rechtermuisklik op geselecteerde tekst of op een
  afbeelding in Finder.

### Acties

Bouw de volgende acties onder elkaar. Waar staat "variabele X instellen",
gebruik je **Stel variabele in** (Set Variable).

**Stap A: token en adres**

1. **Tekst** (Text): plak je token → **Stel variabele in**: `Token`
2. **Tekst**: `https://<jouw-domein>/api/share` → **Stel variabele in**: `Adres`

**Stap B: soort invoer bepalen**

3. **Haal type op** (Get Type) van *Invoer opdracht* (Shortcut Input).
4. **Als** (If) *Type* **is** `Safari-webpagina` (Safari web page)

**Tak 1: Safari-pagina (met of zonder selectie)**

5. **Haal details van Safari-webpagina op** (Get Details of Safari Web Page),
   detail **URL**, van *Invoer opdracht* → variabele `PaginaURL`
6. Nog een keer **Haal details van Safari-webpagina op**, detail
   **Paginaselectie** (Page Selection) → variabele `Selectie`
   *(Bestaat "Paginaselectie" niet bij jou? Sla deze stap over en laat
   `text` hieronder weg; dan wordt alleen de link bewaard.)*
7. **Haal inhoud van URL op** (Get Contents of URL), zie
   [Instelling van het verzoek](#instelling-van-het-verzoek), met als
   **Verzoektekst JSON**:
   - `url` (Tekst) → `PaginaURL`
   - `text` (Tekst) → `Selectie`

**Tak 2: URL (uit een andere app)**

8. **Anders als** (Otherwise If) *Type* **is** `URL`
   *(Heeft je versie geen "Anders als"? Zet dan een nieuwe **Als** binnen het
   **Anders**-blok.)*
9. **Haal inhoud van URL op**, met **JSON**:
   - `url` (Tekst) → *Invoer opdracht*

**Tak 3: afbeelding(en)**

10. **Anders als** *Type* **is** `Afbeelding` (Image)
11. **Herhaal met elk** (Repeat with Each) item in *Invoer opdracht*:
    1. **Converteer afbeelding** (Convert Image) *Herhaalitem* naar **JPEG**
       (kwaliteit ±0,8). Zo krijgt het bestand een type dat Instavol kent.
    2. **Wijzig formaat van afbeelding** (Resize Image): breedte `2000`,
       hoogte automatisch. Zo blijft hij onder de 4 MB.
    3. **Haal inhoud van URL op**, met als verzoektekst **Formulier** (Form):
       - veld `file`, type **Bestand** (File) → *Afbeelding met gewijzigd formaat*
12. **Einde herhaling**

**Tak 4: alles daarnaast = tekst → notitie**

13. **Anders**
14. **Haal inhoud van URL op**, met **JSON**:
    - `text` (Tekst) → *Invoer opdracht*
15. **Einde als**

**Stap C: bevestiging**

16. **Toon melding** (Show Notification): `Bewaard in Instavol ✓`

> Wil je een foutmelding zien als het misgaat: zet vóór stap 16 een
> **Haal woordenboekwaarde op** (Get Dictionary Value) `error` uit
> *Inhoud van URL*, en een **Als** *Woordenboekwaarde* **heeft een waarde**
> → **Toon melding** met die waarde, **Anders** → `Bewaard in Instavol ✓`.

### Instelling van het verzoek

Elke **Haal inhoud van URL op** krijgt dezelfde instellingen (tik op de
actie om ze uit te klappen):

- **URL**: variabele `Adres`
- **Methode**: `POST`
- **Headers**: sleutel `Authorization`, waarde `Bearer ` + variabele `Token`
  (let op de spatie na `Bearer`)
- **Verzoektekst**: JSON of Formulier, zoals per tak hierboven aangegeven

---

## 3. Gebruiken

- **iPhone/iPad:** in Safari, Foto's, Notities enzovoort → **Deel** →
  **Bewaar in Instavol**. Staat hij er niet tussen, scroll dan naar onderen in
  het deelmenu en kies **Wijzig acties**.
- **Safari met selectie (iPhone):** selecteer tekst → **Deel** in het
  selectiemenu. Of er dan ook een URL meekomt, verschilt per versie. Zie je
  alleen een notitie verschijnen, deel dan de pagina via de deelknop van
  Safari zelf, met de tekst nog geselecteerd.
- **Mac:** deelknop in Safari of Foto's, of rechtermuisklik op geselecteerde
  tekst → **Voorzieningen → Bewaar in Instavol**.

## 4. Problemen oplossen

| Melding | Betekenis |
|---|---|
| `Unauthorized` | Token klopt niet of is vervangen. Maak een nieuwe aan en plak hem in stap A1. Controleer ook de spatie na `Bearer`. |
| `Invalid url` | Er werd geen geldige http(s)-link meegestuurd, bijvoorbeeld meerdere links tegelijk. |
| `url is required` | De tak voor URL's kreeg geen URL. Controleer het veld `url` in de JSON. |
| `text is too long` | Notitie of selectie is langer dan 2000 tekens. |
| Fout bij afbeelding (te groot / onbekend type) | Controleer dat stap 11.1 (JPEG) en 11.2 (breedte 2000) vóór het verzenden staan. Maximaal 4 MB; png, jpeg, webp of heic. |

Een link staat eerst op "bezig" (pending): Gemini haalt de pagina op, maakt
een samenvatting en kiest een categorie. Notities en afbeeldingen zijn direct
klaar en gaan niet langs Gemini.
