/**
 * Klimaatnormalen ophalen bij de Open-Meteo archive-API (gratis, geen
 * sleutel). We middelen tien jaar historische dagdata (ERA5): voor een reis
 * één à twee jaar vooruit zijn waarnemingen betrouwbaarder dan
 * klimaatmodel-projecties. De vertaling naar ratings staat in
 * domain/climate.ts.
 */
import { z } from "zod";
import type { ClimateDaily } from "../domain/climate";

export const ARCHIVE_START = "2015-01-01";
export const ARCHIVE_END = "2024-12-31";

/** Coördinaat afgerond op 2 decimalen (~1 km): zat voor klimaat, cache-vriendelijk. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Bouwt de archive-URL (los exporteerbaar zodat dit puur testbaar is). */
export function buildArchiveUrl(coords: { lat: number; lng: number }): string {
  const params = new URLSearchParams({
    latitude: String(roundCoord(coords.lat)),
    longitude: String(roundCoord(coords.lng)),
    start_date: ARCHIVE_START,
    end_date: ARCHIVE_END,
    daily: "temperature_2m_max,precipitation_sum",
    timezone: "UTC",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params}`;
}

// Losse (niet-strict) validatie: de API mag extra velden sturen, maar de
// dagreeksen moeten bestaan en even lang zijn.
const responseSchema = z.looseObject({
  daily: z.looseObject({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
  }),
});

/** Parseert een API-antwoord naar dagreeksen; null bij een onbruikbare vorm. */
export function parseArchiveResponse(data: unknown): ClimateDaily | null {
  const result = responseSchema.safeParse(data);
  if (!result.success) return null;
  const { time, temperature_2m_max, precipitation_sum } = result.data.daily;
  if (temperature_2m_max.length !== time.length || precipitation_sum.length !== time.length) {
    return null;
  }
  return { time, temperature_2m_max, precipitation_sum };
}

export type ClimateFetchResult = { ok: true; daily: ClimateDaily } | { ok: false; error: string };

const FETCH_ERROR =
  "Kon geen klimaatdata ophalen. Controleer je internetverbinding en probeer het later opnieuw.";

// Eén request tegelijk richting Open-Meteo: opeenvolgende aanvragen haken
// aan deze keten, zodat we de gratis API nooit met parallelle calls bestoken.
let queue: Promise<unknown> = Promise.resolve();

/** Haalt tien jaar dagnormalen op voor een locatie; faalt met een NL-melding, gooit nooit. */
export async function fetchClimateDaily(
  coords: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<ClimateFetchResult> {
  const run = async (): Promise<ClimateFetchResult> => {
    try {
      const response = await fetch(buildArchiveUrl(coords), { signal });
      if (!response.ok) return { ok: false, error: FETCH_ERROR };
      const daily = parseArchiveResponse(await response.json());
      if (!daily) return { ok: false, error: FETCH_ERROR };
      return { ok: true, daily };
    } catch {
      return { ok: false, error: FETCH_ERROR };
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}
