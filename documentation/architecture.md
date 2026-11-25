# Architectuur

Instavol is één Next.js-app: pagina's en API-routes staan samen in `app/`, de logica in `lib/`.

- **Database:** Postgres (Neon, via de Vercel-integratie), schema en migraties met Drizzle (`lib/schema.ts`, `drizzle/`).
- **Hosting:** Vercel.
- **Safari-extensie:** `safari-extension/`, bewaart pagina's, selecties en afbeeldingen in Instavol.

Diagram: [architecture.svg](architecture.svg) (bron: `architecture.openflow.json`).

Uitgebreider ontwerp: zie `superpowers/specs/`.

<!-- TODO: aanvullen met auth-flow en verwerking van links (lib/processLink.ts, lib/gemini.ts) -->
