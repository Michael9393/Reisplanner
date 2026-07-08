/**
 * Plaats-autocomplete via de Photon-geocoder van Komoot (gratis, geen
 * sleutel, CORS). Photon levert naam, land en coördinaten; de
 * informatielink construeren we als Wikipedia-zoeklink, die bij een exacte
 * match direct op het artikel landt — daarvoor is geen API-call (en dus
 * geen CSP-uitzondering) nodig.
 */
import { z } from "zod";

export type PlaceSuggestion = {
  name: string;
  country: string | null;
  coords: { lat: number; lng: number };
  /** Korte context, bv. regio of plaatstype, voor in de suggestielijst. */
  description: string | null;
  infoUrl: string;
};

/** Bouwt de Photon-zoek-URL (los exporteerbaar zodat dit puur testbaar is). */
export function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query, limit: "6", lang: "en" });
  return `https://photon.komoot.io/api/?${params}`;
}

/** Wikipedia-zoeklink voor een plaatsnaam (landt bij exacte match op het artikel). */
export function wikipediaSearchUrl(name: string): string {
  return `https://nl.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
}

// Losse validatie van het GeoJSON-antwoord: alleen wat wij nodig hebben,
// extra velden mogen. Let op: GeoJSON-coördinaten zijn [lng, lat].
const responseSchema = z.looseObject({
  features: z.array(
    z.looseObject({
      geometry: z.looseObject({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.looseObject({
        name: z.string().optional(),
        country: z.string().optional(),
        state: z.string().optional(),
        osm_value: z.string().optional(),
      }),
    }),
  ),
});

/** Parseert het Photon-antwoord naar ontdubbelde suggesties. */
export function parseSearchResponse(data: unknown): PlaceSuggestion[] {
  const result = responseSchema.safeParse(data);
  if (!result.success) return [];

  const suggestions: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of result.data.features) {
    const name = feature.properties.name?.trim();
    if (!name) continue;
    const country = feature.properties.country?.trim() || null;
    const key = `${name}|${country ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lng, lat] = feature.geometry.coordinates;
    suggestions.push({
      name,
      country,
      coords: { lat, lng },
      description: feature.properties.state?.trim() || feature.properties.osm_value?.trim() || null,
      infoUrl: wikipediaSearchUrl(name),
    });
  }
  return suggestions;
}

/**
 * Zoekt plaatsen bij Photon. Gooit bij netwerk- of vormfouten; de combobox
 * vangt dat op en degradeert dan stil naar een gewoon tekstveld.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const response = await fetch(buildSearchUrl(query), { signal });
  if (!response.ok) throw new Error(`Photon antwoordde met status ${response.status}`);
  return parseSearchResponse(await response.json());
}
