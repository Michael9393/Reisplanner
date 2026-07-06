# Reisplanner Oost-Azië 2027 - Projectplan

*Versie 0.3 - aangescherpt plan met Dexie-opslag en JSON-exportcontract*

Een local-first webtool voor het plannen en budgetteren van een sabbatical van ongeveer 4 maanden door China, Taiwan, Japan en Korea in 2027. De tool is bedoeld voor gebruik door ons tweeën op één laptop, met een eenvoudige back-upworkflow zodat de reisdata niet afhankelijk blijft van alleen de browser.

De belangrijkste keuze voor v1: **eerst een betrouwbare planningskern**, daarna pas extra reisfeatures. Intern werkt de app met Dexie/IndexedDB-collecties; extern blijft er één JSON-exportbestand voor back-up, Git en import.

---

## 1. Doel & echte MVP

**Kerntaak:** vooraf de route, timing en kosten in beeld krijgen. De app moet helpen om bestemmingen in de juiste periode te plannen, de route visueel te begrijpen en het budget onder controle te houden.

**Echte v1/MVP:**

- Weekplanning met segmenten, startdatums en verblijfsduur.
- Kaart met bestemmingen en routelijn.
- Budget met gepland versus werkelijk, totalen per categorie, land en segment.
- Import/export van het volledige reisdocument als één JSON-bestand.
- Seed-data voor de eerste Oost-Azië-route.
- Basispaklijst als eenvoudige checklist.

**Bewust buiten v1:**

- Geen multi-user sync, accounts of backend.
- Geen native mobiele app.
- Geen vluchtprijsintegratie.
- Geen automatische wisselkoersen.
- Geen live weer als planningslaag.
- Geen dagboek.
- Geen foto's.
- Geen GPX-weergave.
- Geen PWA/offline-kaartpakket.

Deze afbakening houdt de eerste versie uitvoerbaar in twee weken en voorkomt dat ondersteunende modules de planningskern verdringen.

---

## 2. Uitgangspunten

- **Taal:** Nederlands voor UI en content.
- **Valuta:** euro's als hoofdvaluta.
- **Afstanden:** kilometers.
- **Gebruik:** één laptop, gedeeld gebruik, geen accounts.
- **Architectuur:** client-side only in v1, dus geen eigen server of database.
- **Opslag:** Dexie/IndexedDB is lokale werkopslag met collecties; exportbestanden zijn de echte back-up.
- **Hosting:** statische deploy, standaard GitHub Pages.
- **History:** Git-repo aanbevolen voor exportbestanden en projectgeschiedenis.

**Offline versus internet:**

- Werkt zonder internet: bestaande planning bekijken/bewerken, budget, paklijst, import/export van lokale bestanden.
- Heeft internet nodig: kaarttegels laden, eventuele latere live weersinformatie, externe bronnen.
- Belangrijk gevolg: de app is local-first, maar v1 is niet volledig offline zolang kaarttegels niet lokaal gecachet worden.

**Weer, twee lagen:**

- *Planlaag* = seizoensgeschiktheid per bestemming. Dit is v1 en werkt maanden vooraf.
- *Reislaag* = live forecast via bijvoorbeeld Open-Meteo. Dit blijft buiten v1 en is pas nuttig binnen ongeveer twee weken voor aankomst.

---

## 3. Opslagmodel, exportcontract & validatie

De app gebruikt twee vormen van dezelfde reisdata:

- **Intern werkmodel:** Dexie/IndexedDB met losse collecties voor bestemmingen, planning, transport, budget en paklijst.
- **Extern exportcontract:** één versiebeheerbaar JSON-document voor back-up, Git, delen en herstel.

In v1 is er één actieve reis. Toch krijgen alle records een `tripId`, zodat meerdere reizen later mogelijk blijven zonder het opslagmodel opnieuw te ontwerpen.

Bij import is validatie verplicht. Gebruik hiervoor een Zod-schema voor het externe JSON-contract. Ongeldige JSON mag nooit stilzwijgend deels worden geladen; de gebruiker moet een begrijpelijke foutmelding krijgen.

Schema-versioning is verplicht. Elke export bevat `schemaVersion`. Als het schema later verandert, krijgt de app een kleine migratielaag van vorige versies naar de huidige versie.

**Interne Dexie-collecties:**

```ts
type TripRecord = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  currency: "EUR";
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  lastExportedAt: string | null;
};

type DestinationRecord = {
  id: string;
  tripId: string;
  name: string;
  country: string;
  coords: { lat: number; lng: number };
  activities: string[];
  status: "vast" | "kandidaat" | "idee";
  seasonal: SeasonalPeriod[];
  notes: string;
};

type ItinerarySegmentRecord = {
  id: string;
  tripId: string;
  destinationId: string;
  startDate: string;
  nights: number;
  status: "vast" | "kandidaat" | "idee";
  notes: string;
};

type TransportLegRecord = {
  id: string;
  tripId: string;
  fromDestinationId: string | null;
  toDestinationId: string | null;
  date: string;
  mode: "vlucht" | "trein" | "bus" | "boot" | "fiets" | "auto" | "anders";
  label: string;
  estimatedCost: number | null;
  notes: string;
};

type BudgetCategoryRecord = {
  id: string;
  tripId: string;
  label: string;
};

type BudgetItemRecord = {
  id: string;
  tripId: string;
  categoryId: string;
  label: string;
  amountPlanned: number;
  amountActual: number | null;
  destinationId: string | null;
  itinerarySegmentId: string | null;
  transportId: string | null;
  originalAmount: number | null;
  originalCurrency: string | null;
  notes: string;
};

type PackingItemRecord = {
  id: string;
  tripId: string;
  category: string;
  item: string;
  packed: boolean;
  notes: string;
};
```

**Aanbevolen Dexie-indexen:**

- `trips`: `id`
- `destinations`: `id`, `tripId`, `country`, `status`
- `itinerarySegments`: `id`, `tripId`, `destinationId`, `startDate`, `status`
- `transportLegs`: `id`, `tripId`, `fromDestinationId`, `toDestinationId`, `date`
- `budgetCategories`: `id`, `tripId`
- `budgetItems`: `id`, `tripId`, `categoryId`, `destinationId`, `itinerarySegmentId`, `transportId`
- `packingItems`: `id`, `tripId`, `category`, `packed`

**Extern JSON-exportcontract:**

```json
{
  "meta": {
    "id": "trip-east-asia-2027",
    "title": "Oost-Azië 2027",
    "startDate": "2027-05-10",
    "endDate": "2027-09-13",
    "durationWeeks": 18,
    "currency": "EUR",
    "schemaVersion": 1
  },
  "destinations": [
    {
      "id": "cn-beijing",
      "name": "Beijing",
      "country": "China",
      "coords": { "lat": 39.9042, "lng": 116.4074 },
      "activities": ["stad", "cultuur"],
      "status": "vast",
      "seasonal": [
        {
          "period": "2027-05-H1",
          "rating": 4,
          "hazards": ["drukte"],
          "note": "Aangenaam voor stadsbezoek."
        }
      ],
      "notes": ""
    }
  ],
  "itinerary": [
    {
      "id": "seg-1",
      "destinationId": "cn-beijing",
      "startDate": "2027-05-10",
      "nights": 4,
      "status": "vast",
      "notes": ""
    }
  ],
  "transport": [
    {
      "id": "tr-1",
      "fromDestinationId": null,
      "toDestinationId": "cn-beijing",
      "date": "2027-05-10",
      "mode": "vlucht",
      "label": "Amsterdam - Beijing",
      "estimatedCost": 700,
      "notes": ""
    }
  ],
  "budget": {
    "categories": [
      { "id": "cat-flights", "label": "Vluchten" },
      { "id": "cat-stays", "label": "Verblijf" },
      { "id": "cat-food", "label": "Eten" },
      { "id": "cat-activities", "label": "Activiteiten" },
      { "id": "cat-buffer", "label": "Buffer" }
    ],
    "items": [
      {
        "id": "b-1",
        "categoryId": "cat-flights",
        "label": "AMS - PEK",
        "amountPlanned": 700,
        "amountActual": null,
        "destinationId": null,
        "itinerarySegmentId": null,
        "transportId": "tr-1",
        "originalAmount": null,
        "originalCurrency": null,
        "notes": ""
      }
    ]
  },
  "packing": [
    {
      "id": "p-1",
      "category": "Kleding",
      "item": "Regenjas",
      "packed": false,
      "notes": ""
    }
  ]
}
```

**Importflow:**

1. Lees het gekozen JSON-bestand als tekst.
2. Parse JSON; toon een fout als het geen geldige JSON is.
3. Valideer met Zod tegen het exportcontract.
4. Migreer indien `schemaVersion` ouder is dan de huidige versie.
5. Controleer referenties: segmenten, transport en budgetitems mogen alleen naar bestaande records verwijzen, behalve waar `null` expliciet toegestaan is.
6. Vervang de actieve reis in één Dexie-transactie, zodat een mislukte import nooit een half bijgewerkte database achterlaat.
7. Laad de nieuwe actieve reis opnieuw in de UI.

**Exportflow:**

1. Lees alle records voor de actieve `tripId` uit Dexie.
2. Sorteer collecties stabiel, bijvoorbeeld bestemmingen op land/naam, segmenten op startdatum en budgetitems op categorie/label.
3. Bouw het JSON-exportdocument volgens het actuele schema.
4. Valideer het opgebouwde exportdocument nogmaals met hetzelfde Zod-schema.
5. Download het bestand als `oost-azie-2027.json`.
6. Zet `lastExportedAt` op de actieve reis.

**Vaste waarden en afspraken:**

- `status`: `"vast"`, `"kandidaat"` of `"idee"`.
- `seasonal.rating`: 1 tot en met 5, waarbij 1 slecht en 5 uitstekend is.
- `seasonal.period`: halve maand als `YYYY-MM-H1` of `YYYY-MM-H2`.
- `seasonal.hazards`: gestandaardiseerde labels, startset: `"regen"`, `"hitte"`, `"tyfoon"`, `"kou"`, `"drukte"`, `"hoogseizoen"`.
- Budgetitems mogen globaal zijn. Dan zijn `destinationId`, `itinerarySegmentId` en `transportId` allemaal `null`. Dit is nodig voor visa, verzekering, gear en algemene buffer.
- Werkelijke uitgaven blijven primair in euro's, maar `originalAmount` en `originalCurrency` kunnen later lokale bedragen vastleggen zonder automatische wisselkoerslaag.

---

## 4. Dataveiligheid & back-up

Browseropslag is handig, maar niet betrouwbaar genoeg als enige bron. Daarom is de back-upworkflow onderdeel van v1.

- Dexie/IndexedDB is de lokale werkopslag.
- Export naar JSON is de echte back-up.
- De UI toont wanneer voor het laatst lokaal is opgeslagen en wanneer voor het laatst is geëxporteerd.
- Import accepteert alleen geldige documenten volgens het schema.
- Git wordt aanbevolen als history-laag voor geëxporteerde JSON-bestanden.

Minimale back-upflow:

1. App opent de huidige reis uit Dexie/IndexedDB.
2. Gebruiker exporteert het reisdocument naar JSON.
3. Exportbestand wordt buiten de browser bewaard, idealiter in een Git-repo.
4. Bij dataverlies kan hetzelfde bestand opnieuw worden geïmporteerd.

Hard acceptatiecriterium: exporteren, browserdata wissen, importeren en dezelfde reis terugzien zonder dataverlies.

---

## 5. Modules v1

**Weekplanning**

De kern van de app. Toon segmenten op een tijdlijn of kalender, met startdatum, aantal nachten, bestemming, status en seizoensbeoordeling. Segmenten moeten kunnen worden aangepast. De app toont de lopende telling ten opzichte van de totale reisduur.

**Kaart**

Leaflet-kaart met marker per bestemming en een routelijn op basis van de volgorde in de planning. Kaarttegels vragen internet. De tile-provider moet expliciet gekozen worden inclusief attribution en gebruikslimieten.

**Budget**

Categorieën voor vluchten, transport binnen Azië, verblijf, eten, activiteiten, fietslogistiek, visa/verzekering, gear en buffer. Toon gepland versus werkelijk, plus totalen per categorie, land en segment. Globale budgetposten moeten meetellen in het totaal zonder aan een bestemming gekoppeld te zijn.

**Import/export**

Importeer en exporteer het volledige reisdocument als één JSON-bestand. Intern wordt dit bestand vertaald naar Dexie-collecties; bij export worden de collecties weer samengevoegd tot hetzelfde publieke documentformaat. Import valideert het schema en toont duidelijke fouten. Export is de primaire back-upactie.

**Paklijst**

Basale checklist per categorie, afgestemd op warm, nat, koel en fietsspecifiek gebruik. Geen complexe paklijstlogica in v1.

---

## 6. Techstack

- **React + Vite + TypeScript + Tailwind** voor een snelle statische webapp.
- **Dexie + IndexedDB** voor lokale werkopslag met collecties, transacties en indexes.
- **Zustand** voor tijdelijke UI-state, selectie, filters en afgeleide schermstatus; niet als primaire datalaag.
- **Zod** voor schema-validatie en veilige import.
- **Leaflet + react-leaflet** voor kaartweergave.
- **Vitest** voor schema-, datum- en budgetlogica.
- **Playwright** voor minimaal de import/export-rondetest.
- **GitHub Pages** als default hosting.
- **Geen backend/database in v1.**

Open-Meteo, GPX-weergave, PWA/offline-ondersteuning en eventuele sync-backend blijven post-prototype.

---

## 7. Roadmap

**Week 1 - Fundament**

- Repo opzetten met Vite, React, TypeScript en Tailwind.
- JSON-exportcontract en Zod-schema definiëren.
- Dexie-database, collecties, indexes en repository-functies opzetten.
- Import/export-mapping bouwen tussen JSON-document en Dexie-records.
- Import/export-UI bouwen met validatie, foutmeldingen en downloadactie.
- Seed-JSON maken voor de Oost-Azië-route.

**Week 2 - Planningskern**

- Weekplanning bouwen en segmenten bewerkbaar maken.
- Seizoensbeoordeling zichtbaar maken in de planning.
- Kaart met markers en routelijn bouwen.
- Budgetmodule bouwen met totalen per categorie, land en segment.
- Basispaklijst toevoegen.
- Deploy naar GitHub Pages.
- Export/import-dataverliestest uitvoeren.

**Post-prototype**

- Dagboek.
- Live weer via Open-Meteo.
- GPX-routes op de kaart.
- Foto's in dagboek.
- PWA/offline-ondersteuning.
- Sync-backend, alleen als werken op meerdere apparaten echt nodig wordt.

---

## 8. Content-werkstroom

De eerste concrete contentstap is het seed-JSON: een bewerkbare startversie van de reis, niet een vast reisschema.

De reis zoals nu bepaald:

| Land | Duur | Periode | Invulling |
|---|---:|---|---|
| China | 4 wk | mei | Beijing, Xi'an, Chengdu, Zhangjiajie |
| Taiwan | 3 wk | juni | Fietsen nog niet hard gepland |
| Japan | 8 wk | juli-augustus | Hokkaido, Tohoku, Japanse Alpen, steden |
| Korea | 3 wk | september | Seoul, Busan, Jeju, nationale parken |

Volgorde: China -> Taiwan -> Japan -> Korea, met Seoul als eindpunt. Start rond 10 mei 2027 en totale duur ongeveer 18 weken.

Seed-onderdelen:

- Bestemmingen met coördinaten, land, activiteiten, status en notities.
- Seizoensdata per bestemming met rating en hazards.
- Kandidaat-segmenten met indicatieve duur.
- Transportmomenten tussen landen/regio's.
- Budget-skelet met categorieën en placeholderbedragen.
- Paklijst-sjabloon voor het klimaatspectrum van deze reis.

---

## 9. Acceptatiecriteria

De v1 is klaar wanneer deze scenario's werken:

- Geldige seed-data opent correct en vult planning, kaart, budget en paklijst.
- Ongeldige of corrupte JSON wordt geweigerd met een begrijpelijke foutmelding.
- Een geldige import vervangt de actieve reis transactioneel; een mislukte import laat de bestaande reis intact.
- Een segment kan worden aangepast in startdatum, duur en status.
- Ongunstige seizoensvensters zijn zichtbaar in de weekplanning.
- Bestemmingen verschijnen op de kaart en de routelijn volgt de planning.
- Budgettotalen kloppen per categorie, land, segment en totaal.
- Een globale budgetpost zonder bestemming telt mee in het totaalbudget.
- De reis kan worden geëxporteerd, lokale browserdata kan worden gewist, en dezelfde export kan zonder dataverlies opnieuw worden geïmporteerd.

---

## 10. Testcases en scenario's

- Importeer geldige seed-JSON en controleer of alle v1-modules data tonen.
- Importeer corrupte JSON en controleer of de app een duidelijke foutmelding toont.
- Importeer JSON met een kapotte referentie en controleer of de bestaande Dexie-data intact blijft.
- Pas een segmentduur aan en controleer of kalender, kaartlijn en budgetkoppeling blijven kloppen.
- Voeg een globale budgetpost toe zonder bestemming en controleer of die in het totaalbudget meetelt.
- Plan een bestemming in een periode met lage `seasonal.rating` of hazard `"tyfoon"` en controleer of de waarschuwing zichtbaar is.
- Exporteer de reis, wis lokale browserdata, importeer opnieuw en vergelijk de inhoud.
- Exporteer twee keer zonder inhoudelijke wijziging en controleer dat de JSON-volgorde stabiel blijft.

---

## 11. Nog te bepalen

Klein, met default:

1. **Tile-provider voor Leaflet.** Default: OpenStreetMap-compatible provider met correcte attribution en redelijke gebruiksvoorwaarden.
2. **Git-back-updiscipline.** Default: geëxporteerde JSON na belangrijke wijzigingen committen.
3. **Exacte seizoensperioden.** Default: halve maanden voor het hele reisvenster plus een kleine buffer, dus mei tot en met september 2027.
4. **Tablet-responsiveness.** Default: bruikbaar op laptop en tabletformaat; mobiel-perfect is post-prototype.
