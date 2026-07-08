/**
 * Dekt het harde acceptatiecriterium uit het plan: exporteren, browserdata
 * wissen, importeren en dezelfde reis terugzien zonder dataverlies — plus de
 * transactionaliteit van import en de stabiliteit van de export.
 */
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { parseTripDocumentFromText, type TripDocument } from "../domain/schema";
import { ReisplannerDB } from "./db";
import { serializeDocument } from "./mapping";
import {
  addSegment,
  buildExportDocument,
  buildExportFile,
  deleteSegment,
  importDocument,
  markExported,
  updateBudgetItem,
  updateSegment,
  wipeDatabase,
} from "./repo";
import { getSeedDocument } from "./seed";

let counter = 0;
const openDbs: ReisplannerDB[] = [];

function freshDb(): ReisplannerDB {
  const db = new ReisplannerDB(`reisplanner-test-${counter++}`);
  openDbs.push(db);
  return db;
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop()!;
    await db.delete();
  }
});

const TRIP_ID = "trip-east-asia-2027";

describe("importDocument + buildExportDocument", () => {
  it("vult alle collecties vanuit de seed", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    const trip = await db.trips.get(TRIP_ID);
    expect(trip?.title).toBe("Oost-Azië 2027");
    expect(trip?.lastExportedAt).toBeNull();
    expect(await db.destinations.count()).toBe(21);
    expect(await db.itinerarySegments.count()).toBe(20);
    expect(await db.transportLegs.count()).toBe(21);
    expect(await db.budgetCategories.count()).toBe(9);
    expect(await db.budgetItems.count()).toBeGreaterThan(25);
    expect(await db.packingItems.count()).toBeGreaterThan(20);
  });

  it("dataverliestest: export → wissen → import → identieke export", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    const firstExport = serializeDocument(await buildExportDocument(db, TRIP_ID));

    await wipeDatabase(db);
    expect(await db.trips.count()).toBe(0);
    expect(await db.destinations.count()).toBe(0);

    const parsed = parseTripDocumentFromText(firstExport);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importDocument(db, parsed.doc);

    const secondExport = serializeDocument(await buildExportDocument(db, TRIP_ID));
    expect(secondExport).toBe(firstExport);
  });

  it("twee exports zonder inhoudelijke wijziging zijn byte-gelijk", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    const first = serializeDocument(await buildExportDocument(db, TRIP_ID));
    const second = serializeDocument(await buildExportDocument(db, TRIP_ID));
    expect(second).toBe(first);
  });

  it("de export is gelijk aan de (stabiel gesorteerde) seed zelf", async () => {
    const db = freshDb();
    const seed = getSeedDocument();
    await importDocument(db, seed);
    const exported = await buildExportDocument(db, TRIP_ID);

    expect(exported.meta).toEqual(seed.meta);
    expect(exported.destinations).toHaveLength(seed.destinations.length);
    expect(new Set(exported.destinations.map((d) => d.id))).toEqual(
      new Set(seed.destinations.map((d) => d.id)),
    );
    // Alle segmenten identiek (export sorteert op startdatum; seed staat al zo).
    expect(exported.itinerary).toEqual(seed.itinerary);
  });

  it("een mislukte import laat de bestaande reis onaangetast (transactioneel)", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    // Document met dubbele ids passeert bulkAdd niet; de transactie moet
    // volledig terugrollen. (De schema-laag weigert dit normaal al eerder.)
    const seed = getSeedDocument();
    const broken: TripDocument = {
      ...seed,
      meta: { ...seed.meta, id: "trip-kapot", title: "Kapotte import" },
      destinations: [...seed.destinations, { ...seed.destinations[0] }],
    };

    await expect(importDocument(db, broken)).rejects.toThrow();

    const trip = await db.trips.get(TRIP_ID);
    expect(trip?.title).toBe("Oost-Azië 2027");
    expect(await db.trips.count()).toBe(1);
    expect(await db.destinations.count()).toBe(21);
    expect(await db.itinerarySegments.count()).toBe(20);
  });

  it("buildExportFile heeft geen bijwerkingen; markExported registreert het exportmoment", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    const { json, filename } = await buildExportFile(db, TRIP_ID);
    expect(filename).toBe("oost-azie-2027.json");
    expect(json.endsWith("\n")).toBe(true);

    // Alleen bouwen van het bestand telt nog niet als back-up.
    expect((await db.trips.get(TRIP_ID))?.lastExportedAt).toBeNull();

    await markExported(db, TRIP_ID);
    expect((await db.trips.get(TRIP_ID))?.lastExportedAt).not.toBeNull();
  });
});

describe("repo-laag-validatie", () => {
  it("weigert een segment met negatieve nachten even streng als de import", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    await expect(
      addSegment(db, TRIP_ID, {
        destinationId: "cn-beijing",
        startDate: "2027-05-10",
        nights: -1,
        status: "idee",
        notes: "",
      }),
    ).rejects.toThrow(/Ongeldige invoer/);
    expect(await db.itinerarySegments.count()).toBe(20);

    await expect(updateSegment(db, TRIP_ID, "seg-kyoto", { nights: -3 })).rejects.toThrow(
      /Ongeldige invoer/,
    );
    expect((await db.itinerarySegments.get("seg-kyoto"))?.nights).toBe(7);
  });

  it("weigert budgetmutaties met negatieve of onzinnige bedragen", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    await expect(updateBudgetItem(db, TRIP_ID, "b-buffer", { amountActual: -50 })).rejects.toThrow(
      /Ongeldige invoer/,
    );
    expect((await db.budgetItems.get("b-buffer"))?.amountActual).toBeNull();

    await expect(
      updateBudgetItem(db, TRIP_ID, "b-buffer", { amountPlanned: 1e12 }),
    ).rejects.toThrow(/Ongeldige invoer/);
  });

  it("weigert onbekende velden in mutatie-invoer (strict)", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    await expect(
      updateSegment(db, TRIP_ID, "seg-kyoto", {
        nights: 5,
        onbekendVeld: true,
      } as never),
    ).rejects.toThrow(/Ongeldige invoer/);
  });
});

describe("mutaties", () => {
  it("updateSegment past duur aan en houdt de export schema-geldig", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    await updateSegment(db, TRIP_ID, "seg-kyoto", { nights: 4, status: "kandidaat" });

    const segment = await db.itinerarySegments.get("seg-kyoto");
    expect(segment?.nights).toBe(4);
    expect(segment?.status).toBe("kandidaat");

    const trip = await db.trips.get(TRIP_ID);
    expect(trip?.updatedAt).not.toBe(trip?.createdAt);

    // Export blijft geldig na de mutatie (buildExportDocument valideert zelf).
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });

  it("deleteSegment koppelt verwijzende budgetitems los in dezelfde transactie", async () => {
    const db = freshDb();
    await importDocument(db, getSeedDocument());

    // b-act-zhangjiajie hangt aan seg-zhangjiajie.
    await deleteSegment(db, TRIP_ID, "seg-zhangjiajie");

    expect(await db.itinerarySegments.get("seg-zhangjiajie")).toBeUndefined();
    const budgetItem = await db.budgetItems.get("b-act-zhangjiajie");
    expect(budgetItem?.itinerarySegmentId).toBeNull();

    // Zonder de ontkoppeling zou dit falen op een kapotte referentie.
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });
});
