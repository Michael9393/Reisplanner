import type { DestinationRecord, ItinerarySegmentRecord } from "./types";

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
