import { parseTripDocument, type TripDocument } from "../domain/schema";
import seedJson from "../seed/oost-azie-2027.json";
import type { ReisplannerDB } from "./db";
import { importDocument } from "./repo";

/**
 * De seed doorloopt dezelfde validatie als een gebruikersimport; zo bewaakt
 * de app zijn eigen contract en is de seed gegarandeerd een geldig
 * voorbeeld-exportbestand.
 */
export function getSeedDocument(): TripDocument {
  const result = parseTripDocument(seedJson);
  if (!result.ok) {
    throw new Error(`Seed-data is ongeldig: ${result.errors.join(" / ")}`);
  }
  return result.doc;
}

/** Laadt de voorbeeldreis bij een lege database (eerste start). */
export async function loadSeedIfEmpty(db: ReisplannerDB): Promise<boolean> {
  const count = await db.trips.count();
  if (count > 0) return false;
  await importDocument(db, getSeedDocument());
  return true;
}
