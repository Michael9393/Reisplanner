# CLAUDE.md

Local-first reisplanner voor de Oost-Azië-sabbatical 2027. Client-side only:
React 19 + Vite + TypeScript + Tailwind 4, Dexie (IndexedDB), Zod 4, Zustand,
Leaflet. Geen backend. Productscope en afbakening (v1 vs post-prototype) staan
in `docs/PLAN.md`.

**Alles is Nederlands**: UI-teksten, foutmeldingen, comments, commitberichten
en changelog-entries.

## Commands

```bash
npm run dev          # ontwikkelserver
npm run build        # typecheck + productie-build
npm run typecheck    # alleen tsc -b
npm test             # unit tests (Vitest); test:watch voor watch-modus
npx playwright test  # e2e (eerst: npx playwright install chromium,
                     #  of PW_CHROMIUM=/pad/naar/chromium bij een voorgeïnstalleerde browser)
```

## Architectuur

- `src/domain/` — framework-vrij: types, het Zod-**exportcontract** (`schema.ts`),
  datum-/halvemaand-logica (`dates.ts`), seizoensbeoordeling (`season.ts`),
  budgettotalen (`budget.ts`).
- `src/db/` — Dexie-database (`db.ts`), mapping extern JSON-document ↔ interne
  records (`mapping.ts`), alle lees-/schrijfoperaties (`repo.ts`), seed-loader.
- UI leest reisdata uitsluitend via `useLiveQuery` (`src/hooks/useTripData.ts`);
  elke Dexie-mutatie stroomt automatisch door. Zustand (`src/state/ui.ts`) is er
  alleen voor UI-state (actieve tab, open editors) — nooit voor reisdata.
- Datamodel: één actieve reis, maar elk record draagt `tripId` zodat meerdere
  reizen later mogelijk blijven.

## Harde regels bij wijzigingen

- **Veld toevoegen aan het datamodel** raakt altijd vijf plekken tegelijk:
  `domain/types.ts`, het strict schema in `domain/schema.ts` (met
  `SCHEMA_VERSION`-bump + migratie in `migrateDocument`), beide richtingen in
  `db/mapping.ts` (`recordsToDocument` bouwt objecten bewust veld-voor-veld voor
  byte-stabiele exports), de seed (`src/seed/oost-azie-2027.json`) en de tests.
- **Repo-mutaties valideren hun invoer** met schema's afgeleid van het
  exportcontract (`validateInput`-patroon in `db/repo.ts`). Nieuwe mutaties
  volgen dat patroon, zodat lokaal nooit data ontstaat die de export blokkeert.
- **Verwijderen laat nooit kapotte referenties achter**: blokkeer (met duidelijke
  melding) óf ontkoppel in dezelfde transactie — zie `deleteSegment` en
  `deleteDestination` in `db/repo.ts`.
- **Import is transactioneel** (alles of niets); exports worden vóór teruggave
  opnieuw tegen het schema gevalideerd (`buildExportDocument`).
- **Geen boolean-indexes in Dexie** — booleans zijn geen geldige IndexedDB-keys
  (zie toelichting in `db/db.ts`).
- **e2e-testtitels in ASCII** houden: de titel wordt de test-results-mapnaam en
  Chromium weigert stilletjes bestandspaden met unicode bij `setInputFiles`.
- **CSP** in `index.html` staat alleen `self` + OpenStreetMap-tegels toe; een
  nieuwe externe bron vereist een bewuste CSP-aanpassing.
- Leaflet wordt lazy geladen (`MapView` via `React.lazy`); importeer Leaflet
  niet in eagerly geladen modules.

## Workflow

- Feature-branch → PR naar `main`; push naar `main` deployt automatisch naar
  GitHub Pages (`.github/workflows/deploy.yml`).
- Werk `CHANGELOG.md` bij onder **[Niet uitgebracht]** bij elke merge-waardige
  wijziging (Keep a Changelog, Nederlandse koppen).
- Browseropslag is geen back-up: het JSON-exportbestand is de bron van waarheid
  voor herstel — houd de export/import-roundtrip-tests altijd groen.
