import Dexie, { type EntityTable } from "dexie";
import type {
  BudgetCategoryRecord,
  BudgetItemRecord,
  DestinationRecord,
  ItinerarySegmentRecord,
  PackingItemRecord,
  TransportLegRecord,
  TripRecord,
} from "../domain/types";

/**
 * Lokale werkopslag in IndexedDB. Dit is nadrukkelijk géén back-up: het
 * JSON-exportbestand is de echte back-up (zie db/repo.ts).
 *
 * Alle records dragen een tripId zodat meerdere reizen later mogelijk blijven;
 * in v1 is er één actieve reis.
 */
export class ReisplannerDB extends Dexie {
  trips!: EntityTable<TripRecord, "id">;
  destinations!: EntityTable<DestinationRecord, "id">;
  itinerarySegments!: EntityTable<ItinerarySegmentRecord, "id">;
  transportLegs!: EntityTable<TransportLegRecord, "id">;
  budgetCategories!: EntityTable<BudgetCategoryRecord, "id">;
  budgetItems!: EntityTable<BudgetItemRecord, "id">;
  packingItems!: EntityTable<PackingItemRecord, "id">;

  constructor(name = "reisplanner") {
    super(name);
    // Geen index op packingItems.packed: booleans zijn geen geldige
    // IndexedDB-keys; de paklijst is klein genoeg om in JS te filteren.
    this.version(1).stores({
      trips: "id",
      destinations: "id, tripId, country, status",
      itinerarySegments: "id, tripId, destinationId, startDate, status",
      transportLegs: "id, tripId, fromDestinationId, toDestinationId, date",
      budgetCategories: "id, tripId",
      budgetItems: "id, tripId, categoryId, destinationId, itinerarySegmentId, transportId",
      packingItems: "id, tripId, category",
    });
  }
}

export const db = new ReisplannerDB();
