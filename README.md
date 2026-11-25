# Instavol

Webapp om pagina's, selecties en afbeeldingen te bewaren, met een Safari-extensie als snelkoppeling.

## Structuur

| Map | Inhoud |
|-----|--------|
| `app/` | Next.js-app: pagina's en API-routes |
| `lib/` | Gedeelde logica (database, auth, verwerking van links) |
| `drizzle/` | Databasemigraties |
| `safari-extension/` | Safari-extensie "Bewaar in Instavol" |
| `tests/` | Tests (Vitest) |
| `scripts/` | Losse hulpscripts |
| `documentation/` | Architectuur, requirements, ontwerpen en plannen |
| `shared/` | Gereserveerd voor code die later gedeeld wordt; nu leeg |

## Starten

```bash
npm install
npm run dev
```

Zie `.env.example` voor de benodigde omgevingsvariabelen.
