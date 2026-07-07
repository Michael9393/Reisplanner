/**
 * Alle lees- en schrijfoperaties op de database. Mutaties werken de
 * updatedAt van de reis bij; import vervangt de actieve reis in één
 * transactie zodat een mislukte import nooit een half bijgewerkte database
 * achterlaat.
 */
import type { ZodType } from "zod";
import type { TripDocument } from "../domain/schema";
import {
  budgetItemSchema,
  destinationSchema,
  itinerarySegmentSchema,
  packingItemSchema,
  parseTripDocument,
} from "../domain/schema";
import type {
  BudgetItemRecord,
  DestinationRecord,
  ItinerarySegmentRecord,
  PackingItemRecord,
  TripRecord,
} from "../domain/types";
import type { ReisplannerDB } from "./db";
import { documentToRecords, recordsToDocument, serializeDocument } from "./mapping";

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Mutaties valideren hun invoer even streng als de import, zodat er nooit
 * lokaal data ontstaat die later de export blokkeert. De schema's zijn
 * afgeleid van het exportcontract (zonder id, dat maken wij zelf).
 */
function validateInput<T>(schema: ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.length ? issue.path.join(".") : label}: ${issue.message}`)
      .join(" / ");
    throw new Error(`Ongeldige invoer voor ${label}: ${details}`);
  }
  return result.data;
}

const segmentInputSchema = itinerarySegmentSchema.omit({ id: true });
const segmentPatchSchema = segmentInputSchema.partial();
const budgetItemInputSchema = budgetItemSchema.omit({ id: true });
const budgetItemPatchSchema = budgetItemInputSchema.partial();
const packingItemInputSchema = packingItemSchema.omit({ id: true });
const destinationInputSchema = destinationSchema.omit({ id: true });
const destinationPatchSchema = destinationInputSchema.partial();

/** In v1 is er precies één actieve reis: de eerste (en enige) in de tabel. */
export async function getActiveTrip(db: ReisplannerDB): Promise<TripRecord | undefined> {
  return db.trips.toCollection().first();
}

const ALL_TABLES = [
  "trips",
  "destinations",
  "itinerarySegments",
  "transportLegs",
  "budgetCategories",
  "budgetItems",
  "packingItems",
] as const;

/**
 * Vervangt de volledige database-inhoud door het gegeven (al gevalideerde)
 * document, in één transactie: óf alles slaagt, óf er verandert niets.
 */
export async function importDocument(db: ReisplannerDB, doc: TripDocument): Promise<void> {
  const records = documentToRecords(doc, now());
  await db.transaction("rw", [...ALL_TABLES], async () => {
    await Promise.all(ALL_TABLES.map((table) => db.table(table).clear()));
    await db.trips.add(records.trip);
    await db.destinations.bulkAdd(records.destinations);
    await db.itinerarySegments.bulkAdd(records.itinerarySegments);
    await db.transportLegs.bulkAdd(records.transportLegs);
    await db.budgetCategories.bulkAdd(records.budgetCategories);
    await db.budgetItems.bulkAdd(records.budgetItems);
    await db.packingItems.bulkAdd(records.packingItems);
  });
}

/**
 * Leest alle records van de reis en bouwt het exportdocument. Het resultaat
 * wordt vóór teruggave nogmaals tegen het schema gevalideerd: een export die
 * niet aan het eigen contract voldoet, mag de app niet verlaten.
 */
export async function buildExportDocument(
  db: ReisplannerDB,
  tripId: string,
): Promise<TripDocument> {
  const doc = await db.transaction("r", [...ALL_TABLES], async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error(`Reis "${tripId}" bestaat niet.`);
    return recordsToDocument({
      trip,
      destinations: await db.destinations.where("tripId").equals(tripId).toArray(),
      itinerarySegments: await db.itinerarySegments.where("tripId").equals(tripId).toArray(),
      transportLegs: await db.transportLegs.where("tripId").equals(tripId).toArray(),
      budgetCategories: await db.budgetCategories.where("tripId").equals(tripId).toArray(),
      budgetItems: await db.budgetItems.where("tripId").equals(tripId).toArray(),
      packingItems: await db.packingItems.where("tripId").equals(tripId).toArray(),
    });
  });

  const check = parseTripDocument(doc);
  if (!check.ok) {
    throw new Error(`Export voldoet niet aan het schema: ${check.errors.join(" / ")}`);
  }
  return check.doc;
}

/**
 * Bouwt het exportbestand zonder bijwerkingen. Het exportmoment wordt pas
 * geregistreerd met markExported, nadat de download echt is aangeboden —
 * anders kan een mislukte export toch als back-up geregistreerd staan.
 */
export async function buildExportFile(
  db: ReisplannerDB,
  tripId: string,
): Promise<{ json: string; filename: string }> {
  const doc = await buildExportDocument(db, tripId);
  return { json: serializeDocument(doc), filename: `${slugify(doc.meta.title)}.json` };
}

/** Registreert dat de reis zojuist is geëxporteerd. */
export async function markExported(db: ReisplannerDB, tripId: string): Promise<void> {
  await db.trips.update(tripId, { lastExportedAt: now() });
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      // Combinerende diakrieten (accenten) verwijderen na NFD-decompositie.
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "reis"
  );
}

async function touchTrip(db: ReisplannerDB, tripId: string): Promise<void> {
  await db.trips.update(tripId, { updatedAt: now() });
}

/* ------------------------------------------------------------------ */
/* Bestemmingen                                                        */
/* ------------------------------------------------------------------ */

export type DestinationInput = Omit<DestinationRecord, "id" | "tripId">;

export async function addDestination(
  db: ReisplannerDB,
  tripId: string,
  input: DestinationInput,
): Promise<string> {
  const valid = validateInput(destinationInputSchema, input, "bestemming");
  const id = newId();
  await db.transaction("rw", db.destinations, db.trips, async () => {
    await db.destinations.add({ id, tripId, ...valid });
    await touchTrip(db, tripId);
  });
  return id;
}

export async function updateDestination(
  db: ReisplannerDB,
  tripId: string,
  destinationId: string,
  changes: Partial<DestinationInput>,
): Promise<void> {
  const valid = validateInput(destinationPatchSchema, changes, "bestemming");
  await db.transaction("rw", db.destinations, db.trips, async () => {
    await db.destinations.update(destinationId, valid);
    await touchTrip(db, tripId);
  });
}

/**
 * Verwijdert een bestemming. Geblokkeerd zolang er verblijven naar verwijzen
 * (planningsdata verdwijnt nooit stilzwijgend); transport- en
 * budgetverwijzingen worden wél automatisch losgekoppeld (→ null).
 */
export async function deleteDestination(
  db: ReisplannerDB,
  tripId: string,
  destinationId: string,
): Promise<void> {
  await db.transaction(
    "rw",
    db.destinations,
    db.itinerarySegments,
    db.transportLegs,
    db.budgetItems,
    db.trips,
    async () => {
      const segmentCount = await db.itinerarySegments
        .where("destinationId")
        .equals(destinationId)
        .count();
      if (segmentCount > 0) {
        throw new Error(
          `Deze bestemming heeft nog ${segmentCount} ${segmentCount === 1 ? "verblijf" : "verblijven"} in de planning. Verplaats of verwijder die eerst.`,
        );
      }
      await db.transportLegs
        .where("fromDestinationId")
        .equals(destinationId)
        .modify({ fromDestinationId: null });
      await db.transportLegs
        .where("toDestinationId")
        .equals(destinationId)
        .modify({ toDestinationId: null });
      await db.budgetItems
        .where("destinationId")
        .equals(destinationId)
        .modify({ destinationId: null });
      await db.destinations.delete(destinationId);
      await touchTrip(db, tripId);
    },
  );
}

/* ------------------------------------------------------------------ */
/* Segmenten                                                           */
/* ------------------------------------------------------------------ */

export type SegmentInput = {
  destinationId: string;
  startDate: string;
  nights: number;
  status: ItinerarySegmentRecord["status"];
  notes: string;
};

export async function addSegment(
  db: ReisplannerDB,
  tripId: string,
  input: SegmentInput,
): Promise<string> {
  const valid = validateInput(segmentInputSchema, input, "verblijf");
  const id = newId();
  await db.transaction("rw", db.itinerarySegments, db.trips, async () => {
    await db.itinerarySegments.add({ id, tripId, ...valid });
    await touchTrip(db, tripId);
  });
  return id;
}

export async function updateSegment(
  db: ReisplannerDB,
  tripId: string,
  segmentId: string,
  changes: Partial<SegmentInput>,
): Promise<void> {
  const valid = validateInput(segmentPatchSchema, changes, "verblijf");
  await db.transaction("rw", db.itinerarySegments, db.trips, async () => {
    await db.itinerarySegments.update(segmentId, valid);
    await touchTrip(db, tripId);
  });
}

/**
 * Verwijdert een segment en koppelt budgetitems die ernaar verwijzen los
 * (itinerarySegmentId → null), zodat er nooit kapotte referenties ontstaan.
 */
export async function deleteSegment(
  db: ReisplannerDB,
  tripId: string,
  segmentId: string,
): Promise<void> {
  await db.transaction("rw", db.itinerarySegments, db.budgetItems, db.trips, async () => {
    await db.budgetItems
      .where("itinerarySegmentId")
      .equals(segmentId)
      .modify({ itinerarySegmentId: null });
    await db.itinerarySegments.delete(segmentId);
    await touchTrip(db, tripId);
  });
}

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

export type BudgetItemInput = Omit<BudgetItemRecord, "id" | "tripId">;

export async function addBudgetItem(
  db: ReisplannerDB,
  tripId: string,
  input: BudgetItemInput,
): Promise<string> {
  const valid = validateInput(budgetItemInputSchema, input, "budgetpost");
  const id = newId();
  await db.transaction("rw", db.budgetItems, db.trips, async () => {
    await db.budgetItems.add({ id, tripId, ...valid });
    await touchTrip(db, tripId);
  });
  return id;
}

export async function updateBudgetItem(
  db: ReisplannerDB,
  tripId: string,
  itemId: string,
  changes: Partial<BudgetItemInput>,
): Promise<void> {
  const valid = validateInput(budgetItemPatchSchema, changes, "budgetpost");
  await db.transaction("rw", db.budgetItems, db.trips, async () => {
    await db.budgetItems.update(itemId, valid);
    await touchTrip(db, tripId);
  });
}

export async function deleteBudgetItem(
  db: ReisplannerDB,
  tripId: string,
  itemId: string,
): Promise<void> {
  await db.transaction("rw", db.budgetItems, db.trips, async () => {
    await db.budgetItems.delete(itemId);
    await touchTrip(db, tripId);
  });
}

/* ------------------------------------------------------------------ */
/* Paklijst                                                            */
/* ------------------------------------------------------------------ */

export async function addPackingItem(
  db: ReisplannerDB,
  tripId: string,
  input: Omit<PackingItemRecord, "id" | "tripId">,
): Promise<string> {
  const valid = validateInput(packingItemInputSchema, input, "paklijstitem");
  const id = newId();
  await db.transaction("rw", db.packingItems, db.trips, async () => {
    await db.packingItems.add({ id, tripId, ...valid });
    await touchTrip(db, tripId);
  });
  return id;
}

export async function setPackingItemPacked(
  db: ReisplannerDB,
  tripId: string,
  itemId: string,
  packed: boolean,
): Promise<void> {
  await db.transaction("rw", db.packingItems, db.trips, async () => {
    await db.packingItems.update(itemId, { packed });
    await touchTrip(db, tripId);
  });
}

export async function deletePackingItem(
  db: ReisplannerDB,
  tripId: string,
  itemId: string,
): Promise<void> {
  await db.transaction("rw", db.packingItems, db.trips, async () => {
    await db.packingItems.delete(itemId);
    await touchTrip(db, tripId);
  });
}

/* ------------------------------------------------------------------ */
/* Beheer                                                              */
/* ------------------------------------------------------------------ */

/** Wist alle lokale data (voor de dataverliestest of een schone start). */
export async function wipeDatabase(db: ReisplannerDB): Promise<void> {
  await db.transaction("rw", [...ALL_TABLES], async () => {
    await Promise.all(ALL_TABLES.map((table) => db.table(table).clear()));
  });
}
