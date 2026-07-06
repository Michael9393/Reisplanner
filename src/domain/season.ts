/**
 * Seizoensbeoordeling van een verblijf: welke halve maanden raakt een segment
 * en wat zeggen de seizoensdata van de bestemming daarover.
 */
import type { DestinationRecord, Hazard, SeasonalPeriod } from "./types";
import { halfMonthsInRange } from "./dates";

export type SeasonLevel = "goed" | "matig" | "slecht" | "onbekend";

export type SeasonAssessment = {
  /** Seizoensdata van de bestemming die het verblijf overlappen, chronologisch. */
  periods: SeasonalPeriod[];
  /** Laagste rating in het venster; null als er geen seizoensdata is. */
  minRating: number | null;
  /** Unieke hazards over het hele venster. */
  hazards: Hazard[];
  level: SeasonLevel;
};

export function assessSeason(
  destination: Pick<DestinationRecord, "seasonal"> | undefined,
  startDate: string,
  nights: number,
): SeasonAssessment {
  const window = new Set(halfMonthsInRange(startDate, nights));
  const periods = (destination?.seasonal ?? [])
    .filter((entry) => window.has(entry.period))
    .sort((a, b) => a.period.localeCompare(b.period));

  const minRating = periods.length
    ? Math.min(...periods.map((entry) => entry.rating))
    : null;
  const hazards = [...new Set(periods.flatMap((entry) => entry.hazards))];

  let level: SeasonLevel;
  if (minRating === null) level = "onbekend";
  else if (minRating <= 2) level = "slecht";
  else if (minRating === 3) level = "matig";
  else level = "goed";

  return { periods, minRating, hazards, level };
}

/** Verdient dit verblijf een expliciete waarschuwing in de planning? */
export function hasSeasonWarning(assessment: SeasonAssessment): boolean {
  return assessment.level === "slecht" || assessment.hazards.includes("tyfoon");
}
