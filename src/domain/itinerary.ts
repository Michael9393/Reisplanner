import { addDays, diffDays } from "./dates";
import type { DestinationRecord, ItinerarySegmentRecord, TransportLegRecord } from "./types";

/**
 * Landen in reisvolgorde: op volgorde van hun eerste verblijf in de planning,
 * gevolgd door landen zonder verblijf (alfabetisch). Gedeeld door de budget-
 * en bestemmingenweergave zodat beide dezelfde volgorde tonen.
 */
export function countriesInTripOrder(
  destinations: DestinationRecord[],
  segments: ItinerarySegmentRecord[],
): string[] {
  const order: string[] = [];
  const destinationById = new Map(destinations.map((d) => [d.id, d]));
  for (const segment of segments) {
    const country = destinationById.get(segment.destinationId)?.country;
    if (country && !order.includes(country)) order.push(country);
  }
  const rest = [...new Set(destinations.map((d) => d.country))]
    .filter((country) => !order.includes(country))
    .sort((a, b) => a.localeCompare(b, "nl"));
  return [...order, ...rest];
}

/* ------------------------------------------------------------------ */
/* Kettingverschuiving                                                 */
/* ------------------------------------------------------------------ */

export type PlanShift = {
  segmentChanges: { id: string; startDate: string }[];
  transportChanges: { id: string; date: string }[];
};

/** Aantal dagen dat het einde van de reisketen verschuift door de bewerking. */
export function shiftDelta(args: {
  oldStartDate: string;
  oldNights: number;
  newStartDate: string;
  newNights: number;
}): number {
  const oldEnd = addDays(args.oldStartDate, args.oldNights);
  const newEnd = addDays(args.newStartDate, args.newNights);
  return diffDays(oldEnd, newEnd);
}

/**
 * Berekent welke latere verblijven en transporten meeschuiven wanneer één
 * verblijf van datum of duur verandert, zodat de keten sluitend blijft.
 *
 * Twee scharnierpunten, beide op de óúde data van het bewerkte verblijf:
 * - alles op of ná het oude einde (de vertrek-leg en alle latere verblijven
 *   en transporten) schuift mee met de verplaatsing van het einde;
 * - transport tussen het oude begin en het oude einde (de aankomst-leg)
 *   schuift mee met de verplaatsing van het begin.
 * Alles vóór het bewerkte verblijf blijft staan.
 */
export function planShiftForSegmentEdit(args: {
  segments: ItinerarySegmentRecord[];
  transport: TransportLegRecord[];
  segmentId: string;
  oldStartDate: string;
  oldNights: number;
  newStartDate: string;
  newNights: number;
}): PlanShift {
  const oldEnd = addDays(args.oldStartDate, args.oldNights);
  const deltaEnd = shiftDelta(args);
  const deltaStart = diffDays(args.oldStartDate, args.newStartDate);

  const segmentChanges =
    deltaEnd === 0
      ? []
      : args.segments
          .filter((s) => s.id !== args.segmentId && s.startDate >= oldEnd)
          .map((s) => ({ id: s.id, startDate: addDays(s.startDate, deltaEnd) }));

  const transportChanges: PlanShift["transportChanges"] = [];
  for (const leg of args.transport) {
    if (leg.date >= oldEnd) {
      if (deltaEnd !== 0) {
        transportChanges.push({ id: leg.id, date: addDays(leg.date, deltaEnd) });
      }
    } else if (leg.date >= args.oldStartDate && deltaStart !== 0) {
      transportChanges.push({ id: leg.id, date: addDays(leg.date, deltaStart) });
    }
  }

  return { segmentChanges, transportChanges };
}
