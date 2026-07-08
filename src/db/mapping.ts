/**
 * Vertaling tussen het externe JSON-exportcontract en de interne
 * Dexie-records. Bij import krijgt elk record een tripId; bij export wordt
 * die weer weggelaten en worden collecties stabiel gesorteerd zodat twee
 * exports zonder inhoudelijke wijziging byte-voor-byte gelijk zijn.
 */
import type { TripDocument } from "../domain/schema";
import type {
  BudgetCategoryRecord,
  BudgetItemRecord,
  DestinationRecord,
  Hazard,
  ItinerarySegmentRecord,
  PackingItemRecord,
  TransportLegRecord,
  TripRecord,
} from "../domain/types";

export type TripRecords = {
  trip: TripRecord;
  destinations: DestinationRecord[];
  itinerarySegments: ItinerarySegmentRecord[];
  transportLegs: TransportLegRecord[];
  budgetCategories: BudgetCategoryRecord[];
  budgetItems: BudgetItemRecord[];
  packingItems: PackingItemRecord[];
};

/** Omgevingsonafhankelijke stringvergelijking (bewust geen localeCompare). */
function byKey<T>(...keys: ((value: T) => string)[]): (a: T, b: T) => number {
  return (a, b) => {
    for (const key of keys) {
      const ka = key(a);
      const kb = key(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
    }
    return 0;
  };
}

export function documentToRecords(doc: TripDocument, now: string): TripRecords {
  const tripId = doc.meta.id;
  return {
    trip: {
      id: tripId,
      title: doc.meta.title,
      startDate: doc.meta.startDate,
      endDate: doc.meta.endDate,
      durationWeeks: doc.meta.durationWeeks,
      currency: doc.meta.currency,
      schemaVersion: doc.meta.schemaVersion,
      createdAt: now,
      updatedAt: now,
      lastExportedAt: null,
    },
    destinations: doc.destinations.map((d) => ({ tripId, ...d })),
    itinerarySegments: doc.itinerary.map((s) => ({ tripId, ...s })),
    transportLegs: doc.transport.map((t) => ({ tripId, ...t })),
    budgetCategories: doc.budget.categories.map((c) => ({ tripId, ...c })),
    budgetItems: doc.budget.items.map((i) => ({ tripId, ...i })),
    packingItems: doc.packing.map((p) => ({ tripId, ...p })),
  };
}

/**
 * Bouwt het exportdocument op uit records. Elke recordvorm wordt hier veld
 * voor veld overgezet, zodat de volgorde van JSON-sleutels — en daarmee de
 * geserialiseerde export — altijd hetzelfde is, ongeacht opslagvolgorde.
 */
export function recordsToDocument(records: TripRecords): TripDocument {
  const { trip } = records;

  const destinations = [...records.destinations]
    .sort(
      byKey(
        (d) => d.country,
        (d) => d.name,
        (d) => d.id,
      ),
    )
    .map((d) => ({
      id: d.id,
      name: d.name,
      country: d.country,
      coords: { lat: d.coords.lat, lng: d.coords.lng },
      activities: [...d.activities],
      status: d.status,
      seasonal: [...d.seasonal].sort(byKey((s) => s.period)).map((s) => ({
        period: s.period,
        rating: s.rating,
        hazards: [...s.hazards] as Hazard[],
        note: s.note,
      })),
      notes: d.notes,
    }));

  const itinerary = [...records.itinerarySegments]
    .sort(
      byKey(
        (s) => s.startDate,
        (s) => s.id,
      ),
    )
    .map((s) => ({
      id: s.id,
      destinationId: s.destinationId,
      startDate: s.startDate,
      nights: s.nights,
      status: s.status,
      notes: s.notes,
    }));

  const transport = [...records.transportLegs]
    .sort(
      byKey(
        (t) => t.date,
        (t) => t.id,
      ),
    )
    .map((t) => ({
      id: t.id,
      fromDestinationId: t.fromDestinationId,
      toDestinationId: t.toDestinationId,
      date: t.date,
      mode: t.mode,
      label: t.label,
      estimatedCost: t.estimatedCost,
      notes: t.notes,
    }));

  const categories = [...records.budgetCategories]
    .sort(
      byKey(
        (c) => c.label,
        (c) => c.id,
      ),
    )
    .map((c) => ({ id: c.id, label: c.label }));

  const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));
  const items = [...records.budgetItems]
    .sort(
      byKey(
        (i) => categoryLabel.get(i.categoryId) ?? "",
        (i) => i.label,
        (i) => i.id,
      ),
    )
    .map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      label: i.label,
      amountPlanned: i.amountPlanned,
      amountActual: i.amountActual,
      destinationId: i.destinationId,
      itinerarySegmentId: i.itinerarySegmentId,
      transportId: i.transportId,
      originalAmount: i.originalAmount,
      originalCurrency: i.originalCurrency,
      notes: i.notes,
    }));

  const packing = [...records.packingItems]
    .sort(
      byKey(
        (p) => p.category,
        (p) => p.item,
        (p) => p.id,
      ),
    )
    .map((p) => ({
      id: p.id,
      category: p.category,
      item: p.item,
      packed: p.packed,
      notes: p.notes,
    }));

  return {
    meta: {
      id: trip.id,
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      durationWeeks: trip.durationWeeks,
      currency: trip.currency,
      schemaVersion: trip.schemaVersion,
    },
    destinations,
    itinerary,
    transport,
    budget: { categories, items },
    packing,
  };
}

/** Serialiseert een exportdocument leesbaar en deterministisch voor Git. */
export function serializeDocument(doc: TripDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
