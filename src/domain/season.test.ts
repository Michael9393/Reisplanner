import { describe, expect, it } from "vitest";
import { assessSeason, hasSeasonWarning } from "./season";
import type { SeasonalPeriod } from "./types";

const seasonal: SeasonalPeriod[] = [
  { period: "2027-08-H1", rating: 2, hazards: ["hitte", "drukte"], note: "Zeer heet." },
  { period: "2027-08-H2", rating: 2, hazards: ["hitte", "tyfoon"], note: "Obon." },
  { period: "2027-09-H1", rating: 4, hazards: ["tyfoon"], note: "" },
  { period: "2027-09-H2", rating: 5, hazards: [], note: "Beste periode." },
];

describe("assessSeason", () => {
  it("pakt alleen de periodes die het verblijf overlappen", () => {
    const result = assessSeason({ seasonal }, "2027-09-01", 6);
    expect(result.periods.map((p) => p.period)).toEqual(["2027-09-H1"]);
    expect(result.minRating).toBe(4);
    expect(result.level).toBe("goed");
  });

  it("neemt de laagste rating en de vereniging van hazards over het venster", () => {
    // 9 aug + 7 nachten loopt t/m 16 aug: raakt H1 én H2.
    const result = assessSeason({ seasonal }, "2027-08-09", 7);
    expect(result.minRating).toBe(2);
    expect(result.level).toBe("slecht");
    expect(result.hazards).toEqual(expect.arrayContaining(["hitte", "drukte", "tyfoon"]));
  });

  it("geeft onbekend zonder seizoensdata", () => {
    const result = assessSeason({ seasonal: [] }, "2027-08-09", 7);
    expect(result.minRating).toBeNull();
    expect(result.level).toBe("onbekend");
    expect(hasSeasonWarning(result)).toBe(false);
  });
});

describe("hasSeasonWarning", () => {
  it("waarschuwt bij lage rating én bij tyfoon, ook met goede rating", () => {
    expect(hasSeasonWarning(assessSeason({ seasonal }, "2027-08-16", 5))).toBe(true); // rating 2
    expect(hasSeasonWarning(assessSeason({ seasonal }, "2027-09-01", 5))).toBe(true); // tyfoon bij rating 4
    expect(hasSeasonWarning(assessSeason({ seasonal }, "2027-09-17", 5))).toBe(false); // rating 5, geen hazards
  });
});
