/**
 * Budgettotalen: gepland versus werkelijk, opgeteld per categorie, land en
 * segment. Globale posten (zonder koppeling) tellen mee in het totaal en
 * verschijnen in de landtabel onder "Algemeen".
 */
import type {
  BudgetCategoryRecord,
  BudgetItemRecord,
  DestinationRecord,
  ItinerarySegmentRecord,
  TransportLegRecord,
} from "./types";

export const GLOBAL_BUCKET = "Algemeen";

export type Totals = {
  planned: number;
  /** Som van ingevulde werkelijke bedragen. */
  actual: number;
  /** Aantal items waarvan het werkelijke bedrag is ingevuld. */
  actualCount: number;
  itemCount: number;
};

export type BudgetContext = {
  categories: BudgetCategoryRecord[];
  items: BudgetItemRecord[];
  destinations: DestinationRecord[];
  segments: ItinerarySegmentRecord[];
  transport: TransportLegRecord[];
};

function emptyTotals(): Totals {
  return { planned: 0, actual: 0, actualCount: 0, itemCount: 0 };
}

function addToTotals(totals: Totals, item: BudgetItemRecord): void {
  totals.planned += item.amountPlanned;
  totals.itemCount += 1;
  if (item.amountActual !== null) {
    totals.actual += item.amountActual;
    totals.actualCount += 1;
  }
}

export function totalsOverall(items: BudgetItemRecord[]): Totals {
  const totals = emptyTotals();
  for (const item of items) addToTotals(totals, item);
  return totals;
}

/**
 * Land waar een budgetitem bij hoort: direct via bestemming, anders via het
 * segment, anders via de aankomst- (of vertrek-)bestemming van het transport.
 * null betekent: globale post.
 */
export function countryForItem(
  item: BudgetItemRecord,
  ctx: Pick<BudgetContext, "destinations" | "segments" | "transport">,
): string | null {
  const destinationById = new Map(ctx.destinations.map((d) => [d.id, d]));

  if (item.destinationId !== null) {
    return destinationById.get(item.destinationId)?.country ?? null;
  }
  if (item.itinerarySegmentId !== null) {
    const segment = ctx.segments.find((s) => s.id === item.itinerarySegmentId);
    if (segment) return destinationById.get(segment.destinationId)?.country ?? null;
    return null;
  }
  if (item.transportId !== null) {
    const leg = ctx.transport.find((t) => t.id === item.transportId);
    if (!leg) return null;
    const arrival = leg.toDestinationId ? destinationById.get(leg.toDestinationId) : undefined;
    if (arrival) return arrival.country;
    const departure = leg.fromDestinationId
      ? destinationById.get(leg.fromDestinationId)
      : undefined;
    return departure?.country ?? null;
  }
  return null;
}

export function totalsByCategory(ctx: BudgetContext): Map<string, Totals> {
  const result = new Map<string, Totals>();
  for (const category of ctx.categories) result.set(category.id, emptyTotals());
  for (const item of ctx.items) {
    const totals = result.get(item.categoryId) ?? emptyTotals();
    addToTotals(totals, item);
    result.set(item.categoryId, totals);
  }
  return result;
}

/** Totalen per land; globale posten komen onder GLOBAL_BUCKET ("Algemeen"). */
export function totalsByCountry(ctx: BudgetContext): Map<string, Totals> {
  const result = new Map<string, Totals>();
  for (const item of ctx.items) {
    const bucket = countryForItem(item, ctx) ?? GLOBAL_BUCKET;
    const totals = result.get(bucket) ?? emptyTotals();
    addToTotals(totals, item);
    result.set(bucket, totals);
  }
  return result;
}

/** Totalen per segment, alleen voor items die direct aan een segment hangen. */
export function totalsBySegment(ctx: BudgetContext): Map<string, Totals> {
  const result = new Map<string, Totals>();
  for (const item of ctx.items) {
    if (item.itinerarySegmentId === null) continue;
    const totals = result.get(item.itinerarySegmentId) ?? emptyTotals();
    addToTotals(totals, item);
    result.set(item.itinerarySegmentId, totals);
  }
  return result;
}
