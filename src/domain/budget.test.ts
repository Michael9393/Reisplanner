import { describe, expect, it } from "vitest";
import {
  GLOBAL_BUCKET,
  countryForItem,
  totalsByCategory,
  totalsByCountry,
  totalsBySegment,
  totalsOverall,
  type BudgetContext,
} from "./budget";
import type { BudgetItemRecord } from "./types";

const tripId = "trip-test";

function item(overrides: Partial<BudgetItemRecord>): BudgetItemRecord {
  return {
    id: "b-x",
    tripId,
    categoryId: "c1",
    label: "post",
    amountPlanned: 0,
    amountActual: null,
    destinationId: null,
    itinerarySegmentId: null,
    transportId: null,
    originalAmount: null,
    originalCurrency: null,
    notes: "",
    ...overrides,
  };
}

function fixture(): BudgetContext {
  return {
    categories: [
      { id: "c1", tripId, label: "Vluchten" },
      { id: "c2", tripId, label: "Verblijf" },
    ],
    destinations: [
      {
        id: "d-cn",
        tripId,
        name: "Beijing",
        country: "China",
        coords: { lat: 39.9, lng: 116.4 },
        activities: [],
        status: "vast",
        seasonal: [],
        notes: "",
      },
      {
        id: "d-jp",
        tripId,
        name: "Tokyo",
        country: "Japan",
        coords: { lat: 35.7, lng: 139.7 },
        activities: [],
        status: "vast",
        seasonal: [],
        notes: "",
      },
    ],
    segments: [
      {
        id: "s1",
        tripId,
        destinationId: "d-jp",
        startDate: "2027-08-16",
        nights: 7,
        status: "vast",
        notes: "",
      },
    ],
    transport: [
      {
        id: "t1",
        tripId,
        fromDestinationId: "d-cn",
        toDestinationId: "d-jp",
        date: "2027-08-16",
        mode: "vlucht",
        label: "PEK – HND",
        estimatedCost: 300,
        notes: "",
      },
      {
        id: "t2",
        tripId,
        fromDestinationId: "d-cn",
        toDestinationId: null,
        date: "2027-09-13",
        mode: "vlucht",
        label: "Terug",
        estimatedCost: null,
        notes: "",
      },
    ],
    items: [
      item({ id: "b1", amountPlanned: 100, destinationId: "d-cn" }),
      item({ id: "b2", amountPlanned: 200, amountActual: 180, itinerarySegmentId: "s1", categoryId: "c2" }),
      item({ id: "b3", amountPlanned: 300, transportId: "t1" }),
      item({ id: "b4", amountPlanned: 400 }), // globale post
      item({ id: "b5", amountPlanned: 50, transportId: "t2" }), // transport zonder aankomst → land van vertrek
    ],
  };
}

describe("countryForItem", () => {
  it("volgt bestemming, segment en transport naar het juiste land", () => {
    const ctx = fixture();
    expect(countryForItem(ctx.items[0], ctx)).toBe("China");
    expect(countryForItem(ctx.items[1], ctx)).toBe("Japan"); // via segment
    expect(countryForItem(ctx.items[2], ctx)).toBe("Japan"); // via aankomst van transport
    expect(countryForItem(ctx.items[3], ctx)).toBeNull(); // globaal
    expect(countryForItem(ctx.items[4], ctx)).toBe("China"); // terugvlucht: vertrekland
  });
});

describe("totalsOverall", () => {
  it("telt gepland en werkelijk, inclusief globale posten", () => {
    const totals = totalsOverall(fixture().items);
    expect(totals.planned).toBe(100 + 200 + 300 + 400 + 50);
    expect(totals.actual).toBe(180);
    expect(totals.actualCount).toBe(1);
    expect(totals.itemCount).toBe(5);
  });
});

describe("totalsByCategory", () => {
  it("groepeert per categorie en kent lege categorieën nul toe", () => {
    const totals = totalsByCategory(fixture());
    expect(totals.get("c1")?.planned).toBe(100 + 300 + 400 + 50);
    expect(totals.get("c2")?.planned).toBe(200);
    expect(totals.get("c2")?.actual).toBe(180);
  });
});

describe("totalsByCountry", () => {
  it("zet globale posten onder Algemeen en telt ze mee in het geheel", () => {
    const totals = totalsByCountry(fixture());
    expect(totals.get("China")?.planned).toBe(100 + 50);
    expect(totals.get("Japan")?.planned).toBe(200 + 300);
    expect(totals.get(GLOBAL_BUCKET)?.planned).toBe(400);

    const sum = [...totals.values()].reduce((acc, t) => acc + t.planned, 0);
    expect(sum).toBe(totalsOverall(fixture().items).planned);
  });
});

describe("totalsBySegment", () => {
  it("telt alleen items die direct aan een segment hangen", () => {
    const totals = totalsBySegment(fixture());
    expect(totals.get("s1")?.planned).toBe(200);
    expect(totals.size).toBe(1);
  });
});
