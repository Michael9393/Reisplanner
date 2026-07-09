# Changelog

Alle noemenswaardige wijzigingen aan dit project worden hier bijgehouden.

Het formaat volgt [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/) en het
project gebruikt [semantische versionering](https://semver.org/lang/nl/). Werk bij
elke merge-waardige wijziging de sectie **[Niet uitgebracht]** bij; bij een release
krijgt die sectie een versienummer en datum.

## [Niet uitgebracht]

### Toegevoegd

- Automatische seizoensratings: de knop "Seizoensdata ophalen" in de
  bestemmingseditor zet klimaatnormalen van Open-Meteo (2015–2024) om naar
  ratings per halve maand met hazards (hitte, kou, regen, tyfoonseizoen).
  Nieuwe bestemmingen zonder seizoensdata worden na het opslaan automatisch
  op de achtergrond gevuld; automatisch gegenereerde periodes zijn herkenbaar
  aan de "Automatisch"-notitie en handwerk wordt nooit stil overschreven.
- Tabblad **Kladblok**: losse bestemmingsideeën snel vastleggen (alleen een
  naam is genoeg; land, coördinaten, notitie en link optioneel) en later met
  één knop promoveren tot volwaardige bestemming in de planner.
- Plaats-autocomplete (Photon-geocoder) in de bestemmingseditor en het
  kladblok: typ bijvoorbeeld "kyo" en kies Kyoto — naam, land, coördinaten en
  een Wikipedia-informatielink worden automatisch ingevuld. Zonder internet
  blijft het veld een gewoon tekstveld.

- Transportbeheer in de UI: transportmomenten toevoegen, bewerken en verwijderen
  vanuit de tijdlijn (datum, vervoerwijze, van/naar-bestemming, kosten, notities).
  Verwijderen koppelt budgetposten die ernaar verwijzen automatisch los.
- Kettingverschuiving: wanneer je een verblijf langer/korter maakt of verplaatst,
  biedt de segmenteditor aan om alle latere verblijven en transporten in één keer
  mee te schuiven, zodat de planning sluitend blijft.
- Ontwikkel-tooling: Biome als linter/formatter (met `npm run verify` als ene
  controlepoort), pre-commit hook via husky + lint-staged, coverage-script,
  typecheck voor de e2e-laag, CI met lint-stap en Playwright-browsercache,
  maandelijkse Dependabot-updates en een PR-template met kwaliteitschecklist.

- Tabblad **Bestemmingen**: bestemmingen toevoegen, bewerken en verwijderen in de
  UI, inclusief een editor voor seizoensdata per halve maand (rating 1–5,
  hazard-toggles, notitie). Een geplakt "lat, lng"-paar splitst automatisch over
  de coördinaatvelden.
- "Bewerken"-knop in de kaart-popup die direct naar de bestemmingseditor springt.
- De kaart hercentreert automatisch wanneer de bestemmingsset wijzigt
  (bijvoorbeeld na een import).

### Gewijzigd

- Exportschema naar versie 2: nieuwe `ideas`-collectie (kladblok) en een
  optionele `infoUrl` per bestemming. Oude exports (versie 1) migreren
  automatisch bij import.
- De Content-Security-Policy staat twee externe databronnen toe:
  `archive-api.open-meteo.com` (klimaatdata) en `photon.komoot.io`
  (plaatssuggesties).
- Bestemming verwijderen is geblokkeerd zolang er verblijven naar verwijzen;
  transport- en budgetverwijzingen worden automatisch losgekoppeld.
- De kaart (Leaflet) wordt lazy geladen: hoofdbundel van ± 600 kB naar ± 458 kB.
- "Alle lokale data wissen" waarschuwt expliciet wanneer er nooit is geëxporteerd
  of de laatste export verouderd is; onderhoudsacties tonen fouten in de UI.
- Modals: Escape sluit, focus blijft binnen het venster (focus-trap) en de
  achtergrond sluit alleen bij een klik die daar ook begon.

### Beveiliging

- Schema's zijn strict: onbekende velden worden bij import geweigerd met een
  duidelijke melding in plaats van stil te verdwijnen.
- Harde limieten op veldlengtes, bedragen en collectiegroottes; importbestanden
  zijn begrensd op 10 MB (gecontroleerd vóór het inlezen).
- Alle mutaties valideren hun invoer in de repo-laag met dezelfde schema's als
  de import.
- Het exportmoment (`lastExportedAt`) wordt pas geregistreerd nadat de download
  echt is aangeboden — een mislukte export telt niet als back-up.
- Content-Security-Policy en referrer-policy in `index.html`; het CI-workflow
  draait met minimale permissions.

## [0.1.0] — 2026-07-06

### Toegevoegd

- **Weekplanning**: chronologische tijdlijn van verblijven en transport met
  weeknummers, nachtenteller ten opzichte van de reisduur, gat/overlap-detectie
  en bewerkbare segmenten (bestemming, startdatum, nachten, status, notities).
- **Seizoensbeoordeling** per halve maand (rating 1–5 en hazards zoals tyfoon,
  hitte en drukte) zichtbaar in de planning, met waarschuwing bij ongunstige
  vensters en een live seizoenspreview in de segmenteditor.
- **Kaart** (Leaflet + OpenStreetMap): marker per bestemming met statuskleur en
  een routelijn die de planningsvolgorde volgt.
- **Budget**: gepland versus werkelijk, totalen per categorie, land en segment;
  globale posten (visa, verzekering, gear, buffer) tellen mee onder "Algemeen".
- **Paklijst**: checklist per categorie met voortgang en snel toevoegen/afvinken.
- **Import/export**: de volledige reis als één JSON-bestand (schemaversie 1) met
  Zod-validatie, referentiecontrole en Nederlandse foutmeldingen; import vervangt
  de reis transactioneel, export is deterministisch gesorteerd en daardoor
  Git-vriendelijk.
- **Seed**: bewerkbare voorbeeldreis Oost-Azië 2027 (China → Taiwan → Japan →
  Zuid-Korea, 10 mei – 13 september, 126 nachten) met seizoensdata, transport,
  budget-skelet en paklijst.
- **Tests**: unit tests (Vitest + fake-indexeddb) inclusief de dataverliestest
  (export → wissen → import → identiek) en Playwright-e2e voor de rondetest.
- **Deploy**: GitHub Actions-workflows voor CI en GitHub Pages.
