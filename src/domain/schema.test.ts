import { describe, expect, it } from "vitest";
import seedJson from "../seed/oost-azie-2027.json";
import { parseTripDocument, parseTripDocumentFromText, SCHEMA_VERSION } from "./schema";

function minimalDoc() {
  return {
    meta: {
      id: "trip-test",
      title: "Testreis",
      startDate: "2027-05-10",
      endDate: "2027-05-17",
      durationWeeks: 1,
      currency: "EUR",
      schemaVersion: SCHEMA_VERSION,
    },
    destinations: [
      {
        id: "d1",
        name: "Beijing",
        country: "China",
        coords: { lat: 39.9, lng: 116.4 },
        activities: ["stad"],
        status: "vast",
        seasonal: [{ period: "2027-05-H1", rating: 4, hazards: ["drukte"], note: "" }],
        notes: "",
      },
    ],
    itinerary: [
      {
        id: "s1",
        destinationId: "d1",
        startDate: "2027-05-10",
        nights: 7,
        status: "vast",
        notes: "",
      },
    ],
    transport: [
      {
        id: "t1",
        fromDestinationId: null,
        toDestinationId: "d1",
        date: "2027-05-10",
        mode: "vlucht",
        label: "AMS – PEK",
        estimatedCost: 700,
        notes: "",
      },
    ],
    budget: {
      categories: [{ id: "c1", label: "Vluchten" }],
      items: [
        {
          id: "b1",
          categoryId: "c1",
          label: "AMS – PEK",
          amountPlanned: 700,
          amountActual: null,
          destinationId: null,
          itinerarySegmentId: null,
          transportId: "t1" as string | null,
          originalAmount: null,
          originalCurrency: null,
          notes: "",
        },
      ],
    },
    packing: [{ id: "p1", category: "Kleding", item: "Regenjas", packed: false, notes: "" }],
  };
}

describe("parseTripDocument", () => {
  it("accepteert de meegeleverde seed", () => {
    const result = parseTripDocument(seedJson);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.meta.id).toBe("trip-east-asia-2027");
      expect(result.doc.destinations.length).toBeGreaterThan(15);
      expect(result.doc.itinerary.length).toBe(20);
      expect(result.migratedFrom).toBeNull();
    }
  });

  it("accepteert een minimaal geldig document", () => {
    const result = parseTripDocument(minimalDoc());
    expect(result.ok).toBe(true);
  });

  it("weigert een document zonder meta", () => {
    const result = parseTripDocument({ destinations: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("meta");
  });

  it("weigert een nieuwere schemaversie met een duidelijke melding", () => {
    const doc = minimalDoc();
    doc.meta.schemaVersion = 99;
    const result = parseTripDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("schemaversie 99");
  });

  it("weigert een niet-bestaande datum", () => {
    const doc = minimalDoc();
    doc.itinerary[0].startDate = "2027-02-30";
    const result = parseTripDocument(doc);
    expect(result.ok).toBe(false);
  });

  it("weigert einddatum vóór startdatum", () => {
    const doc = minimalDoc();
    doc.meta.endDate = "2027-05-01";
    const result = parseTripDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("einddatum");
  });

  it("weigert een ongeldige seasonal-periode en rating buiten 1-5", () => {
    const badPeriod = minimalDoc();
    badPeriod.destinations[0].seasonal[0].period = "2027-13-H1";
    expect(parseTripDocument(badPeriod).ok).toBe(false);

    const badHalf = minimalDoc();
    badHalf.destinations[0].seasonal[0].period = "2027-05-H3";
    expect(parseTripDocument(badHalf).ok).toBe(false);

    const badRating = minimalDoc();
    badRating.destinations[0].seasonal[0].rating = 6;
    expect(parseTripDocument(badRating).ok).toBe(false);
  });

  it("weigert een onbekend hazard-label", () => {
    const doc = minimalDoc();
    doc.destinations[0].seasonal[0].hazards = ["sneeuwstorm"];
    expect(parseTripDocument(doc).ok).toBe(false);
  });

  it("weigert kapotte referenties met een begrijpelijke melding", () => {
    const doc = minimalDoc();
    doc.itinerary[0].destinationId = "bestaat-niet";
    const result = parseTripDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("s1");
      expect(result.errors[0]).toContain("bestaat-niet");
    }
  });

  it("weigert budgetitems die naar onbekende records verwijzen", () => {
    const doc = minimalDoc();
    doc.budget.items[0].transportId = "t-onbekend";
    const result = parseTripDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("t-onbekend");
  });

  it("staat null-koppelingen op budgetitems expliciet toe (globale post)", () => {
    const doc = minimalDoc();
    doc.budget.items[0].transportId = null;
    expect(parseTripDocument(doc).ok).toBe(true);
  });

  it("weigert dubbele ids binnen een collectie", () => {
    const doc = minimalDoc();
    doc.destinations.push({ ...doc.destinations[0] });
    const result = parseTripDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("dubbel id");
  });

  it("weigert onbekende velden in plaats van ze stil te laten verdwijnen (strict)", () => {
    const withUnknownRoot = { ...minimalDoc(), dagboek: [] };
    const rootResult = parseTripDocument(withUnknownRoot);
    expect(rootResult.ok).toBe(false);
    if (!rootResult.ok) expect(rootResult.errors.join(" ")).toContain("dagboek");

    const doc = minimalDoc();
    (doc.destinations[0] as Record<string, unknown>).kleur = "paars";
    const nestedResult = parseTripDocument(doc);
    expect(nestedResult.ok).toBe(false);
    if (!nestedResult.ok) expect(nestedResult.errors.join(" ")).toContain("kleur");
  });

  it("weigert extreme veldlengtes en collectiegroottes", () => {
    const longNotes = minimalDoc();
    longNotes.destinations[0].notes = "x".repeat(5001);
    expect(parseTripDocument(longNotes).ok).toBe(false);

    const longName = minimalDoc();
    longName.meta.title = "x".repeat(201);
    expect(parseTripDocument(longName).ok).toBe(false);

    const tooMany = minimalDoc();
    tooMany.packing = Array.from({ length: 2001 }, (_, i) => ({
      id: `p-${i}`,
      category: "Test",
      item: `Item ${i}`,
      packed: false,
      notes: "",
    }));
    expect(parseTripDocument(tooMany).ok).toBe(false);
  });
});

describe("parseTripDocumentFromText", () => {
  it("weigert corrupte JSON met een begrijpelijke melding", () => {
    const result = parseTripDocumentFromText("{ dit is geen json ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("geen geldige JSON");
  });

  it("parseert een geldige JSON-tekst", () => {
    const result = parseTripDocumentFromText(JSON.stringify(minimalDoc()));
    expect(result.ok).toBe(true);
  });
});
