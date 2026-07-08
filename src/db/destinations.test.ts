/**
 * Bestemmingenbeheer: toevoegen/bijwerken/verwijderen met behoud van
 * referentie-integriteit — verwijderen blokkeert op verblijven en koppelt
 * transport en budget automatisch los.
 */
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { ReisplannerDB } from "./db";
import {
  addDestination,
  buildExportDocument,
  deleteDestination,
  deleteSegment,
  importDocument,
  updateDestination,
} from "./repo";
import { getSeedDocument } from "./seed";

let counter = 0;
const openDbs: ReisplannerDB[] = [];

function freshDb(): ReisplannerDB {
  const db = new ReisplannerDB(`reisplanner-dest-test-${counter++}`);
  openDbs.push(db);
  return db;
}

async function seededDb(): Promise<ReisplannerDB> {
  const db = freshDb();
  await importDocument(db, getSeedDocument());
  return db;
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop()!;
    await db.delete();
  }
});

const TRIP_ID = "trip-east-asia-2027";

describe("addDestination / updateDestination", () => {
  it("voegt een bestemming toe die in een geldige export belandt", async () => {
    const db = await seededDb();

    const id = await addDestination(db, TRIP_ID, {
      name: "Nikko",
      country: "Japan",
      coords: { lat: 36.7198, lng: 139.6982 },
      activities: ["tempels", "watervallen"],
      status: "idee",
      seasonal: [{ period: "2027-08-H2", rating: 4, hazards: ["drukte"], note: "" }],
      notes: "Optie vanuit Tokyo.",
      infoUrl: null,
    });

    const stored = await db.destinations.get(id);
    expect(stored?.tripId).toBe(TRIP_ID);

    const doc = await buildExportDocument(db, TRIP_ID);
    expect(doc.destinations.some((d) => d.name === "Nikko")).toBe(true);
  });

  it("valideert invoer even streng als de import", async () => {
    const db = await seededDb();

    await expect(
      addDestination(db, TRIP_ID, {
        name: "Fout",
        country: "Japan",
        coords: { lat: 123, lng: 0 }, // lat buiten bereik
        activities: [],
        status: "idee",
        seasonal: [],
        notes: "",
        infoUrl: null,
      }),
    ).rejects.toThrow(/Ongeldige invoer/);

    await expect(
      updateDestination(db, TRIP_ID, "jp-tokyo", {
        seasonal: [{ period: "2027-15-H1", rating: 3, hazards: [], note: "" }],
      }),
    ).rejects.toThrow(/Ongeldige invoer/);
    expect((await db.destinations.get("jp-tokyo"))?.seasonal.length).toBeGreaterThan(0);
  });

  it("werkt een bestemming bij en houdt de export geldig", async () => {
    const db = await seededDb();

    await updateDestination(db, TRIP_ID, "tw-alishan", {
      status: "kandidaat",
      notes: "Toch serieus overwegen.",
    });

    const stored = await db.destinations.get("tw-alishan");
    expect(stored?.status).toBe("kandidaat");
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });
});

describe("deleteDestination", () => {
  it("blokkeert zolang er verblijven naar verwijzen en laat alles intact", async () => {
    const db = await seededDb();

    await expect(deleteDestination(db, TRIP_ID, "jp-kyoto")).rejects.toThrow(/verblijf/);
    expect(await db.destinations.get("jp-kyoto")).toBeDefined();
    expect(await db.itinerarySegments.get("seg-kyoto")).toBeDefined();
  });

  it("koppelt transport en budget los en houdt de export geldig", async () => {
    const db = await seededDb();

    // kr-jeju heeft één verblijf, transport van/naar, en een budgetpost.
    await deleteSegment(db, TRIP_ID, "seg-jeju");
    await deleteDestination(db, TRIP_ID, "kr-jeju");

    expect(await db.destinations.get("kr-jeju")).toBeUndefined();
    expect((await db.transportLegs.get("tr-busan-jeju"))?.toDestinationId).toBeNull();
    expect((await db.transportLegs.get("tr-jeju-seoraksan"))?.fromDestinationId).toBeNull();
    expect((await db.budgetItems.get("b-fiets-jeju"))?.destinationId).toBeNull();

    // Zonder de ontkoppeling zou de exportvalidatie op kapotte referenties vallen.
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });

  it("verwijderen zonder verwijzingen werkt direct", async () => {
    const db = await seededDb();

    // tw-alishan (status idee) heeft geen segmenten, transport of budget.
    await deleteDestination(db, TRIP_ID, "tw-alishan");
    expect(await db.destinations.get("tw-alishan")).toBeUndefined();
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });
});
