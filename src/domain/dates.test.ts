import { describe, expect, it } from "vitest";
import {
  addDays,
  diffDays,
  halfMonthForDate,
  halfMonthsBetween,
  halfMonthsInRange,
  isValidISODate,
  tripWeekNumber,
} from "./dates";

describe("isValidISODate", () => {
  it("accepteert echte datums", () => {
    expect(isValidISODate("2027-05-10")).toBe(true);
    expect(isValidISODate("2027-02-28")).toBe(true);
    expect(isValidISODate("2028-02-29")).toBe(true); // schrikkeljaar
  });

  it("weigert onzin en niet-bestaande datums", () => {
    expect(isValidISODate("2027-02-30")).toBe(false);
    expect(isValidISODate("2027-13-01")).toBe(false);
    expect(isValidISODate("2027-5-1")).toBe(false);
    expect(isValidISODate("10-05-2027")).toBe(false);
    expect(isValidISODate("")).toBe(false);
  });
});

describe("addDays / diffDays", () => {
  it("telt over maand- en jaargrenzen heen", () => {
    expect(addDays("2027-05-30", 8)).toBe("2027-06-07");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2027-05-10", 0)).toBe("2027-05-10");
    expect(addDays("2027-05-10", -1)).toBe("2027-05-09");
  });

  it("diffDays is het omgekeerde van addDays", () => {
    expect(diffDays("2027-05-10", "2027-06-07")).toBe(28);
    expect(diffDays("2027-06-07", "2027-05-10")).toBe(-28);
    expect(diffDays("2027-05-10", "2027-05-10")).toBe(0);
  });

  it("de reis uit het plan is precies 18 weken", () => {
    expect(diffDays("2027-05-10", "2027-09-13")).toBe(18 * 7);
  });
});

describe("halfMonthForDate", () => {
  it("splitst op dag 15/16", () => {
    expect(halfMonthForDate("2027-05-01")).toBe("2027-05-H1");
    expect(halfMonthForDate("2027-05-15")).toBe("2027-05-H1");
    expect(halfMonthForDate("2027-05-16")).toBe("2027-05-H2");
    expect(halfMonthForDate("2027-05-31")).toBe("2027-05-H2");
  });
});

describe("halfMonthsInRange", () => {
  it("dekt aankomst tot en met vertrek", () => {
    // 10 t/m 17 mei: beide helften van mei.
    expect(halfMonthsInRange("2027-05-10", 7)).toEqual(["2027-05-H1", "2027-05-H2"]);
  });

  it("gaat over maandgrenzen heen", () => {
    expect(halfMonthsInRange("2027-05-30", 8)).toEqual(["2027-05-H2", "2027-06-H1"]);
  });

  it("kort verblijf binnen één helft levert één periode", () => {
    expect(halfMonthsInRange("2027-05-02", 3)).toEqual(["2027-05-H1"]);
    expect(halfMonthsInRange("2027-05-02", 0)).toEqual(["2027-05-H1"]);
  });
});

describe("halfMonthsBetween", () => {
  it("geeft beide helften van elke maand in het venster", () => {
    expect(halfMonthsBetween("2027-05-10", "2027-06-01")).toEqual([
      "2027-05-H1",
      "2027-05-H2",
      "2027-06-H1",
      "2027-06-H2",
    ]);
  });

  it("werkt binnen één maand en over een jaargrens", () => {
    expect(halfMonthsBetween("2027-05-01", "2027-05-31")).toEqual(["2027-05-H1", "2027-05-H2"]);
    expect(halfMonthsBetween("2027-12-15", "2028-01-10")).toEqual([
      "2027-12-H1",
      "2027-12-H2",
      "2028-01-H1",
      "2028-01-H2",
    ]);
  });
});

describe("tripWeekNumber", () => {
  it("week 1 begint op de startdatum", () => {
    expect(tripWeekNumber("2027-05-10", "2027-05-10")).toBe(1);
    expect(tripWeekNumber("2027-05-10", "2027-05-16")).toBe(1);
    expect(tripWeekNumber("2027-05-10", "2027-05-17")).toBe(2);
    expect(tripWeekNumber("2027-05-10", "2027-09-07")).toBe(18);
  });
});
