import { describe, expect, it } from "vitest";
import {
  aggregateClimate,
  buildSeasonalFromClimate,
  type ClimateDaily,
  type HalfMonthClimate,
  inTyphoonWindow,
  rateHalfMonth,
} from "./climate";

const KYOTO = { lat: 35.01, lng: 135.77 };
const BEIJING = { lat: 39.9, lng: 116.4 };
const OKINAWA = { lat: 26.21, lng: 127.68 };

function dailyOf(entries: [string, number | null, number | null][]): ClimateDaily {
  return {
    time: entries.map(([date]) => date),
    temperature_2m_max: entries.map(([, temp]) => temp),
    precipitation_sum: entries.map(([, , precip]) => precip),
  };
}

function climate(period: string, avgMaxTemp: number, avgDailyPrecip: number): HalfMonthClimate {
  return { period, avgMaxTemp, avgDailyPrecip };
}

describe("aggregateClimate", () => {
  it("deelt dagen op de H1/H2-grens in: dag 15 hoort bij H1, dag 16 bij H2", () => {
    const daily = dailyOf([
      ["2024-05-15", 20, 0],
      ["2024-05-16", 30, 10],
    ]);
    const result = aggregateClimate(daily, ["2027-05-H1", "2027-05-H2"]);
    expect(result).toEqual([
      { period: "2027-05-H1", avgMaxTemp: 20, avgDailyPrecip: 0 },
      { period: "2027-05-H2", avgMaxTemp: 30, avgDailyPrecip: 10 },
    ]);
  });

  it("middelt dezelfde kalender-halvemaand over meerdere jaren heen", () => {
    const daily = dailyOf([
      ["2023-05-01", 20, 2],
      ["2024-05-02", 30, 4],
    ]);
    const result = aggregateClimate(daily, ["2027-05-H1"]);
    expect(result).toEqual([{ period: "2027-05-H1", avgMaxTemp: 25, avgDailyPrecip: 3 }]);
  });

  it("slaat null-gaten over in het gemiddelde", () => {
    const daily = dailyOf([
      ["2024-05-01", 20, null],
      ["2024-05-02", null, 6],
      ["2024-05-03", 30, 2],
    ]);
    const result = aggregateClimate(daily, ["2027-05-H1"]);
    expect(result).toEqual([{ period: "2027-05-H1", avgMaxTemp: 25, avgDailyPrecip: 4 }]);
  });

  it("laat periodes zonder data weg", () => {
    const daily = dailyOf([["2024-05-01", 20, 0]]);
    expect(aggregateClimate(daily, ["2027-06-H1"])).toEqual([]);
    expect(aggregateClimate(dailyOf([]), ["2027-05-H1"])).toEqual([]);
  });
});

describe("inTyphoonWindow", () => {
  it("markeert Okinawa in augustus, maar niet in mei", () => {
    expect(inTyphoonWindow(OKINAWA, 8)).toBe(true);
    expect(inTyphoonWindow(OKINAWA, 5)).toBe(false);
  });

  it("laat locaties buiten de regio met rust", () => {
    // Beijing (lat 39.9) valt nog nét binnen de kaart; Amsterdam niet.
    expect(inTyphoonWindow(BEIJING, 8)).toBe(true);
    expect(inTyphoonWindow({ lat: 52.37, lng: 4.9 }, 8)).toBe(false);
  });
});

describe("rateHalfMonth", () => {
  it("geeft 5/5 zonder hazards bij mild en droog weer", () => {
    const result = rateHalfMonth(climate("2027-05-H1", 22, 2), KYOTO);
    expect(result.rating).toBe(5);
    expect(result.hazards).toEqual([]);
  });

  it("trekt punten af op de hittedrempels (31 en 35 °C)", () => {
    expect(rateHalfMonth(climate("2027-05-H1", 31, 0), KYOTO).rating).toBe(4);
    expect(rateHalfMonth(climate("2027-05-H1", 35, 0), KYOTO).rating).toBe(3);
    expect(rateHalfMonth(climate("2027-05-H1", 35, 0), KYOTO).hazards).toEqual(["hitte"]);
  });

  it("trekt punten af op de koudedrempels (14 en 8 °C)", () => {
    expect(rateHalfMonth(climate("2027-01-H1", 13.9, 0), BEIJING).rating).toBe(4);
    expect(rateHalfMonth(climate("2027-01-H1", 7.9, 0), BEIJING).rating).toBe(3);
    expect(rateHalfMonth(climate("2027-01-H1", 7.9, 0), BEIJING).hazards).toEqual(["kou"]);
  });

  it("trekt punten af op de regendrempels (6 en 12 mm/dag)", () => {
    expect(rateHalfMonth(climate("2027-06-H1", 25, 6), KYOTO).rating).toBe(4);
    expect(rateHalfMonth(climate("2027-06-H1", 25, 12), KYOTO).rating).toBe(3);
    expect(rateHalfMonth(climate("2027-06-H1", 25, 12), KYOTO).hazards).toEqual(["regen"]);
  });

  it("telt het tyfoonvenster mee als extra risico", () => {
    const august = rateHalfMonth(climate("2027-08-H1", 25, 2), OKINAWA);
    expect(august.rating).toBe(4);
    expect(august.hazards).toEqual(["tyfoon"]);

    const may = rateHalfMonth(climate("2027-05-H1", 25, 2), OKINAWA);
    expect(may.hazards).toEqual([]);
  });

  it("klemt de rating op minimaal 1 bij gestapelde aftrek", () => {
    // Hitte (−2) + regen (−2) + tyfoon (−1) = −5 → geklemd op 1.
    const worst = rateHalfMonth(climate("2027-08-H2", 36, 15), OKINAWA);
    expect(worst.rating).toBe(1);
    expect(worst.hazards).toEqual(["hitte", "regen", "tyfoon"]);
  });

  it("schrijft een deterministische Nederlandse note met Automatisch-prefix", () => {
    const result = rateHalfMonth(climate("2027-05-H1", 21.6, 3.25), KYOTO);
    expect(result.note).toBe("Automatisch (Open-Meteo): gem. max 22°C, 3,3 mm/dag.");
  });
});

describe("buildSeasonalFromClimate", () => {
  it("bouwt gesorteerde seizoensdata voor de reisperiodes", () => {
    const daily = dailyOf([
      ["2024-06-01", 25, 2],
      ["2024-05-20", 22, 1],
    ]);
    const result = buildSeasonalFromClimate(daily, ["2027-06-H1", "2027-05-H2"], KYOTO);
    expect(result.map((entry) => entry.period)).toEqual(["2027-05-H2", "2027-06-H1"]);
    expect(result.every((entry) => entry.rating === 5)).toBe(true);
  });

  it("geeft een lege lijst bij lege dagdata", () => {
    expect(buildSeasonalFromClimate(dailyOf([]), ["2027-05-H1"], KYOTO)).toEqual([]);
  });
});
