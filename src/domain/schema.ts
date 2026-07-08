/**
 * Het externe JSON-exportcontract, gevalideerd met Zod.
 *
 * Dit schema beschrijft het publieke documentformaat voor back-up, Git en
 * import — records hier hebben géén tripId (die zit impliciet in meta.id).
 * De vertaling van en naar Dexie-records staat in db/mapping.ts.
 */
import { z } from "zod";
import { isValidISODate } from "./dates";
import { HAZARDS, STATUSES, TRANSPORT_MODES } from "./types";

export const SCHEMA_VERSION = 1;

/** Bovengrens voor importbestanden; een reisdocument is ~100 KB. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

// Ruime bovengrenzen: legitiem gebruik raakt ze nooit, maar een corrupt of
// kwaadaardig bestand kan de browser niet meer vastzetten met extreme data.
const MAX_COLLECTION = 2000;

// Nederlandse foutmeldingen voor alle standaard Zod-validaties.
z.config(z.locales.nl());

const isoDate = z
  .string()
  .refine(isValidISODate, { error: "moet een geldige datum in YYYY-MM-DD-formaat zijn" });

const halfMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-H[12]$/, {
  error: "moet een halve maand zijn in het formaat YYYY-MM-H1 of YYYY-MM-H2",
});

const id = z.string().min(1).max(200);
const shortText = z.string().min(1).max(200);
const notesText = z.string().max(5000);
const amount = z.number().min(0).max(100_000_000);

export const seasonalPeriodSchema = z.strictObject({
  period: halfMonth,
  rating: z.number().int().min(1).max(5),
  hazards: z.array(z.enum(HAZARDS)).max(20),
  note: notesText,
});

export const destinationSchema = z.strictObject({
  id,
  name: shortText,
  country: shortText,
  coords: z.strictObject({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  activities: z.array(z.string().max(200)).max(100),
  status: z.enum(STATUSES),
  seasonal: z.array(seasonalPeriodSchema).max(200),
  notes: notesText,
});

export const itinerarySegmentSchema = z.strictObject({
  id,
  destinationId: id,
  startDate: isoDate,
  nights: z.number().int().min(0).max(1000),
  status: z.enum(STATUSES),
  notes: notesText,
});

export const transportLegSchema = z.strictObject({
  id,
  fromDestinationId: id.nullable(),
  toDestinationId: id.nullable(),
  date: isoDate,
  mode: z.enum(TRANSPORT_MODES),
  label: shortText,
  estimatedCost: amount.nullable(),
  notes: notesText,
});

export const budgetCategorySchema = z.strictObject({
  id,
  label: shortText,
});

export const budgetItemSchema = z.strictObject({
  id,
  categoryId: id,
  label: shortText,
  amountPlanned: amount,
  amountActual: amount.nullable(),
  destinationId: id.nullable(),
  itinerarySegmentId: id.nullable(),
  transportId: id.nullable(),
  originalAmount: amount.nullable(),
  originalCurrency: z.string().min(1).max(10).nullable(),
  notes: notesText,
});

export const packingItemSchema = z.strictObject({
  id,
  category: shortText,
  item: shortText,
  packed: z.boolean(),
  notes: notesText,
});

export const tripMetaSchema = z
  .strictObject({
    id,
    title: shortText,
    startDate: isoDate,
    endDate: isoDate,
    durationWeeks: z.number().int().positive().max(520),
    currency: z.literal("EUR"),
    schemaVersion: z.number().int().positive(),
  })
  .refine((meta) => meta.startDate <= meta.endDate, {
    error: "einddatum mag niet vóór de startdatum liggen",
    path: ["endDate"],
  });

export const tripDocumentSchema = z.strictObject({
  meta: tripMetaSchema,
  destinations: z.array(destinationSchema).max(MAX_COLLECTION),
  itinerary: z.array(itinerarySegmentSchema).max(MAX_COLLECTION),
  transport: z.array(transportLegSchema).max(MAX_COLLECTION),
  budget: z.strictObject({
    categories: z.array(budgetCategorySchema).max(MAX_COLLECTION),
    items: z.array(budgetItemSchema).max(MAX_COLLECTION),
  }),
  packing: z.array(packingItemSchema).max(MAX_COLLECTION),
});

export type TripDocument = z.infer<typeof tripDocumentSchema>;
export type TripMeta = z.infer<typeof tripMetaSchema>;

/* ------------------------------------------------------------------ */
/* Migratie                                                            */
/* ------------------------------------------------------------------ */

/**
 * Migraties van oudere schemaversies naar de huidige. `migrations[n]` zet een
 * document van versie n om naar versie n+1. Nu leeg: versie 1 is de eerste.
 */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

export type MigrationResult =
  | { ok: true; data: unknown; migratedFrom: number | null }
  | { ok: false; error: string };

export function migrateDocument(raw: unknown): MigrationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Het bestand bevat geen JSON-object met reisdata." };
  }
  const meta = (raw as Record<string, unknown>).meta;
  if (typeof meta !== "object" || meta === null) {
    return { ok: false, error: "Het document mist het verplichte 'meta'-blok." };
  }
  const version = (meta as Record<string, unknown>).schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "Het document heeft geen geldige 'meta.schemaVersion'." };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Dit document heeft schemaversie ${version}, maar deze app ondersteunt maximaal versie ${SCHEMA_VERSION}. Werk de app bij.`,
    };
  }
  let doc = raw as Record<string, unknown>;
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) {
      return {
        ok: false,
        error: `Er is geen migratie beschikbaar van schemaversie ${v} naar ${v + 1}.`,
      };
    }
    doc = migrate(doc);
    doc.meta = { ...(doc.meta as Record<string, unknown>), schemaVersion: v + 1 };
  }
  return { ok: true, data: doc, migratedFrom: version < SCHEMA_VERSION ? version : null };
}

/* ------------------------------------------------------------------ */
/* Referentie-integriteit                                              */
/* ------------------------------------------------------------------ */

function findDuplicateIds(label: string, ids: string[], errors: string[]): void {
  const seen = new Set<string>();
  for (const value of ids) {
    if (seen.has(value)) errors.push(`${label} bevat een dubbel id: "${value}".`);
    seen.add(value);
  }
}

/**
 * Controleert of alle verwijzingen kloppen: segmenten, transport en
 * budgetitems mogen alleen naar bestaande records wijzen (behalve waar null
 * expliciet is toegestaan) en ids moeten uniek zijn binnen hun collectie.
 */
export function findReferenceErrors(doc: TripDocument): string[] {
  const errors: string[] = [];

  findDuplicateIds(
    "Bestemmingen",
    doc.destinations.map((d) => d.id),
    errors,
  );
  findDuplicateIds(
    "Planning",
    doc.itinerary.map((s) => s.id),
    errors,
  );
  findDuplicateIds(
    "Transport",
    doc.transport.map((t) => t.id),
    errors,
  );
  findDuplicateIds(
    "Budgetcategorieën",
    doc.budget.categories.map((c) => c.id),
    errors,
  );
  findDuplicateIds(
    "Budgetitems",
    doc.budget.items.map((i) => i.id),
    errors,
  );
  findDuplicateIds(
    "Paklijst",
    doc.packing.map((p) => p.id),
    errors,
  );

  const destinationIds = new Set(doc.destinations.map((d) => d.id));
  const segmentIds = new Set(doc.itinerary.map((s) => s.id));
  const transportIds = new Set(doc.transport.map((t) => t.id));
  const categoryIds = new Set(doc.budget.categories.map((c) => c.id));

  for (const segment of doc.itinerary) {
    if (!destinationIds.has(segment.destinationId)) {
      errors.push(
        `Segment "${segment.id}" verwijst naar onbekende bestemming "${segment.destinationId}".`,
      );
    }
  }

  for (const leg of doc.transport) {
    if (leg.fromDestinationId !== null && !destinationIds.has(leg.fromDestinationId)) {
      errors.push(
        `Transport "${leg.id}" vertrekt vanaf onbekende bestemming "${leg.fromDestinationId}".`,
      );
    }
    if (leg.toDestinationId !== null && !destinationIds.has(leg.toDestinationId)) {
      errors.push(`Transport "${leg.id}" gaat naar onbekende bestemming "${leg.toDestinationId}".`);
    }
  }

  for (const item of doc.budget.items) {
    if (!categoryIds.has(item.categoryId)) {
      errors.push(
        `Budgetitem "${item.label}" verwijst naar onbekende categorie "${item.categoryId}".`,
      );
    }
    if (item.destinationId !== null && !destinationIds.has(item.destinationId)) {
      errors.push(
        `Budgetitem "${item.label}" verwijst naar onbekende bestemming "${item.destinationId}".`,
      );
    }
    if (item.itinerarySegmentId !== null && !segmentIds.has(item.itinerarySegmentId)) {
      errors.push(
        `Budgetitem "${item.label}" verwijst naar onbekend segment "${item.itinerarySegmentId}".`,
      );
    }
    if (item.transportId !== null && !transportIds.has(item.transportId)) {
      errors.push(
        `Budgetitem "${item.label}" verwijst naar onbekend transport "${item.transportId}".`,
      );
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* Volledige parse-flow                                                */
/* ------------------------------------------------------------------ */

export type ParseResult =
  | { ok: true; doc: TripDocument; migratedFrom: number | null }
  | { ok: false; errors: string[] };

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "document";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Valideert een al geparsed JSON-waarde als reisdocument: migratie →
 * schemavalidatie → referentiecontrole. Geeft óf een geldig document, óf een
 * lijst begrijpelijke foutmeldingen — nooit een half resultaat.
 */
export function parseTripDocument(data: unknown): ParseResult {
  const migrated = migrateDocument(data);
  if (!migrated.ok) return { ok: false, errors: [migrated.error] };

  const result = tripDocumentSchema.safeParse(migrated.data);
  if (!result.success) return { ok: false, errors: formatZodIssues(result.error) };

  const referenceErrors = findReferenceErrors(result.data);
  if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };

  return { ok: true, doc: result.data, migratedFrom: migrated.migratedFrom };
}

/** Parse een JSON-tekst (bijvoorbeeld een geüpload bestand) als reisdocument. */
export function parseTripDocumentFromText(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [
        "Het bestand is geen geldige JSON. Controleer of het een onbeschadigd exportbestand is.",
      ],
    };
  }
  return parseTripDocument(data);
}
