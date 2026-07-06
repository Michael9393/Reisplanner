import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { getActiveTrip } from "../db/repo";
import type {
  BudgetCategoryRecord,
  BudgetItemRecord,
  DestinationRecord,
  ItinerarySegmentRecord,
  PackingItemRecord,
  TransportLegRecord,
  TripRecord,
} from "../domain/types";

export type TripData = {
  /** undefined = nog aan het laden; null = geen reis in de database. */
  trip: TripRecord | null | undefined;
  destinations: DestinationRecord[];
  segments: ItinerarySegmentRecord[];
  transport: TransportLegRecord[];
  budgetCategories: BudgetCategoryRecord[];
  budgetItems: BudgetItemRecord[];
  packingItems: PackingItemRecord[];
};

/**
 * Alle data van de actieve reis als live queries: elke Dexie-mutatie (ook een
 * import die alles vervangt) stroomt automatisch door naar de UI.
 */
export function useTripData(): TripData {
  const trip = useLiveQuery(async () => (await getActiveTrip(db)) ?? null, []);
  const tripId = trip?.id;

  const destinations = useLiveQuery(
    () => (tripId ? db.destinations.where("tripId").equals(tripId).toArray() : []),
    [tripId],
  );
  const segments = useLiveQuery(
    () => (tripId ? db.itinerarySegments.where("tripId").equals(tripId).sortBy("startDate") : []),
    [tripId],
  );
  const transport = useLiveQuery(
    () => (tripId ? db.transportLegs.where("tripId").equals(tripId).sortBy("date") : []),
    [tripId],
  );
  const budgetCategories = useLiveQuery(
    () => (tripId ? db.budgetCategories.where("tripId").equals(tripId).toArray() : []),
    [tripId],
  );
  const budgetItems = useLiveQuery(
    () => (tripId ? db.budgetItems.where("tripId").equals(tripId).toArray() : []),
    [tripId],
  );
  const packingItems = useLiveQuery(
    () => (tripId ? db.packingItems.where("tripId").equals(tripId).toArray() : []),
    [tripId],
  );

  return {
    trip,
    destinations: destinations ?? [],
    segments: segments ?? [],
    transport: transport ?? [],
    budgetCategories: budgetCategories ?? [],
    budgetItems: budgetItems ?? [],
    packingItems: packingItems ?? [],
  };
}
