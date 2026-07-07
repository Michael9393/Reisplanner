# Reisplanner Oost-Azië 2027

Local-first webtool voor het plannen en budgetteren van een sabbatical van ± 18 weken
door China, Taiwan, Japan en Zuid-Korea (mei – september 2027). Gebouwd voor gebruik
door twee personen op één laptop, zonder accounts, server of database.

Het volledige projectplan staat in [`docs/PLAN.md`](docs/PLAN.md).

## Wat kan de v1

- **Weekplanning** — segmenten met startdatum, nachten en status (vast / kandidaat / idee),
  chronologisch gemengd met transport, inclusief gat/overlap-detectie en
  seizoensbeoordeling per verblijf (rating 1-5 + hazards zoals tyfoon of hitte).
- **Kaart** — Leaflet met een marker per bestemming (kleur = status) en een routelijn
  die de planningsvolgorde volgt. Kaarttegels vereisen internet; de rest van de app niet.
- **Budget** — gepland versus werkelijk, totalen per categorie, land en segment.
  Globale posten (visa, verzekering, gear, buffer) tellen mee zonder bestemming.
- **Paklijst** — checklist per categorie, afgestemd op warm/nat/koel/fiets.
- **Import/export** — de volledige reis als één JSON-bestand, gevalideerd met Zod
  (schemaversie, referentie-integriteit, begrijpelijke foutmeldingen). Import vervangt
  de reis transactioneel: een mislukte import laat de bestaande data intact.

## Opslag & back-up (belangrijk)

De app bewaart alles lokaal in de browser (Dexie/IndexedDB). **Browseropslag is geen
back-up.** De workflow:

1. Plan en wijzig in de app — alles wordt automatisch lokaal opgeslagen.
2. Exporteer na belangrijke wijzigingen via de knop **Exporteren** (JSON-bestand).
3. Commit het exportbestand in een Git-repository.
4. Bij dataverlies of een andere laptop: importeer hetzelfde bestand.

De app toont in de header wanneer er voor het laatst lokaal is opgeslagen en
geëxporteerd, en waarschuwt bij niet-geëxporteerde wijzigingen.

## Ontwikkelen

Vereist Node 22+.

```bash
npm install
npm run dev        # ontwikkelserver
npm run verify     # typecheck + lint (Biome) + unit tests + build — draai dit vóór elke commit
npm run e2e        # Playwright: de import/export-rondetest in een echte browser
npm run test:coverage  # unit tests met coverage-rapport
```

Een pre-commit hook (husky + lint-staged) formatteert en lint gewijzigde bestanden
automatisch; CI draait daarnaast het volledige verify-pad en de e2e-suite, en
Dependabot opent maandelijks een verzamel-PR met dependency-updates.

Voor de e2e-tests is eenmalig `npx playwright install chromium` nodig, of zet
`PW_CHROMIUM=/pad/naar/chromium` als er al een browser-binary is.

Bij de eerste start laadt de app automatisch de voorbeeldreis uit
`src/seed/oost-azie-2027.json` — dat bestand is zelf een geldig exportdocument en
dient als startpunt, niet als vast reisschema.

## Techstack

React 19 · Vite 7 · TypeScript · Tailwind 4 · Dexie (IndexedDB) · Zod 4 · Zustand ·
Leaflet/react-leaflet · Vitest · Playwright

## Structuur

```
src/
  domain/    types, Zod-exportcontract (schema.ts), datum-/seizoens-/budgetlogica
  db/        Dexie-database, document↔record-mapping, import/export, seed-loader
  hooks/     live queries (dexie-react-hooks)
  state/     Zustand voor UI-state (tabs, open editors)
  components/  de vijf views + gedeelde bouwstenen
  seed/      oost-azie-2027.json (voorbeeldreis, tevens exportvoorbeeld)
e2e/         Playwright-rondetest (export → wissen → import zonder dataverlies)
```

Wijzigingen per versie staan in [`CHANGELOG.md`](CHANGELOG.md).

## Deploy (GitHub Pages)

De workflow `.github/workflows/deploy.yml` bouwt en publiceert naar GitHub Pages bij
elke push naar `main` (of handmatig via *Run workflow*). Eenmalig instellen:
repo **Settings → Pages → Source: GitHub Actions**.

## Schema-afspraken

- Extern JSON-contract met `meta.schemaVersion` (nu 1) en een migratielaag voor
  toekomstige versies; nieuwere versies dan de app kent worden geweigerd.
- `status`: `vast` | `kandidaat` | `idee`.
- `seasonal.period`: halve maanden (`YYYY-MM-H1` / `YYYY-MM-H2`), `rating` 1–5,
  `hazards` uit: regen, hitte, tyfoon, kou, drukte, hoogseizoen.
- Bedragen in euro's; `originalAmount`/`originalCurrency` kunnen lokale bedragen
  vastleggen zonder wisselkoerslaag.
- Alle records dragen een `tripId` zodat meerdere reizen later mogelijk blijven.
