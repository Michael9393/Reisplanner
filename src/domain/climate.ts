/**
 * Vertaling van meerjarige klimaatnormalen (dagelijkse maxtemperatuur en
 * neerslag) naar de seizoensbeoordeling per halve maand. Puur en
 * framework-vrij; het ophalen van de data staat in services/openMeteo.ts.
 */

import type { Hazard, SeasonalPeriod } from "./types";

/** Ruwe dagreeksen zoals de Open-Meteo archive-API ze levert (parallelle arrays). */
export type ClimateDaily = {
  time: string[];
  temperature_2m_max: (number | null)[];
  precipitation_sum: (number | null)[];
};

export type HalfMonthClimate = {
  /** Reisperiode "YYYY-MM-H1|H2" waarop de normalen zijn geprojecteerd. */
  period: string;
  /** Gemiddelde dagelijkse maximumtemperatuur (°C) over alle jaren. */
  avgMaxTemp: number;
  /** Gemiddelde neerslag (mm per dag) over alle jaren. */
  avgDailyPrecip: number;
};

/** Kalender-halvemaand ("MM-H1|H2") van een ISO-datum, jaar genegeerd. */
function calendarHalfMonth(isoDate: string): string {
  const month = isoDate.slice(5, 7);
  const day = Number(isoDate.slice(8, 10));
  return `${month}-${day <= 15 ? "H1" : "H2"}`;
}

/**
 * Middelt meerjarige dagdata per kalender-halvemaand (jaar genegeerd) en
 * projecteert het resultaat op de gevraagde reisperiodes ("YYYY-MM-Hx").
 * Dagen met null-gaten tellen niet mee; periodes zonder data vervallen.
 */
export function aggregateClimate(daily: ClimateDaily, periods: string[]): HalfMonthClimate[] {
  const sums = new Map<
    string,
    { temp: number; tempDays: number; precip: number; precipDays: number }
  >();

  for (let i = 0; i < daily.time.length; i++) {
    const key = calendarHalfMonth(daily.time[i]);
    const entry = sums.get(key) ?? { temp: 0, tempDays: 0, precip: 0, precipDays: 0 };
    const temp = daily.temperature_2m_max[i];
    if (temp !== null && temp !== undefined) {
      entry.temp += temp;
      entry.tempDays++;
    }
    const precip = daily.precipitation_sum[i];
    if (precip !== null && precip !== undefined) {
      entry.precip += precip;
      entry.precipDays++;
    }
    sums.set(key, entry);
  }

  const result: HalfMonthClimate[] = [];
  for (const period of periods) {
    // "YYYY-MM-Hx" → kalendersleutel "MM-Hx".
    const entry = sums.get(period.slice(5));
    if (!entry || entry.tempDays === 0 || entry.precipDays === 0) continue;
    result.push({
      period,
      avgMaxTemp: entry.temp / entry.tempDays,
      avgDailyPrecip: entry.precip / entry.precipDays,
    });
  }
  return result;
}

/**
 * Ligt deze locatie/maand in het Oost-Aziatische tyfoonseizoen? Vaste
 * regiokaart (juli–oktober, lat 5–40, lng 100–150): meerjarige normalen
 * middelen tyfonen weg, dus dit risico is niet uit de data af te leiden.
 */
export function inTyphoonWindow(coords: { lat: number; lng: number }, month: number): boolean {
  return (
    month >= 7 &&
    month <= 10 &&
    coords.lat >= 5 &&
    coords.lat <= 40 &&
    coords.lng >= 100 &&
    coords.lng <= 150
  );
}

/** Nederlands getal met één decimaal (komma als scheidingsteken). */
function formatMm(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/**
 * Vertaalt klimaatnormalen naar één SeasonalPeriod. Heuristiek: start op 5
 * en trek punten af voor hitte, kou, regen en tyfoonrisico; de note draagt
 * het prefix "Automatisch" zodat handwerk herkenbaar blijft.
 */
export function rateHalfMonth(
  climate: HalfMonthClimate,
  coords: { lat: number; lng: number },
): SeasonalPeriod {
  let score = 5;
  const hazards: Hazard[] = [];

  if (climate.avgMaxTemp >= 35) {
    score -= 2;
    hazards.push("hitte");
  } else if (climate.avgMaxTemp >= 31) {
    score -= 1;
    hazards.push("hitte");
  }

  if (climate.avgMaxTemp < 8) {
    score -= 2;
    hazards.push("kou");
  } else if (climate.avgMaxTemp < 14) {
    score -= 1;
    hazards.push("kou");
  }

  if (climate.avgDailyPrecip >= 12) {
    score -= 2;
    hazards.push("regen");
  } else if (climate.avgDailyPrecip >= 6) {
    score -= 1;
    hazards.push("regen");
  }

  const month = Number(climate.period.slice(5, 7));
  if (inTyphoonWindow(coords, month)) {
    score -= 1;
    hazards.push("tyfoon");
  }

  return {
    period: climate.period,
    rating: Math.min(5, Math.max(1, score)),
    hazards,
    note: `Automatisch (Open-Meteo): gem. max ${Math.round(climate.avgMaxTemp)}°C, ${formatMm(climate.avgDailyPrecip)} mm/dag.`,
  };
}

/** Complete pijplijn: dagdata → seizoensdata voor de gegeven reisperiodes. */
export function buildSeasonalFromClimate(
  daily: ClimateDaily,
  periods: string[],
  coords: { lat: number; lng: number },
): SeasonalPeriod[] {
  return aggregateClimate(daily, periods)
    .map((climate) => rateHalfMonth(climate, coords))
    .sort((a, b) => a.period.localeCompare(b.period));
}
