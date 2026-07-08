/**
 * Transportbeheer en kettingverschuiving: CRUD met validatie en
 * budget-ontkoppeling, en het transactioneel meeschuiven van de keten
 * wanneer een verblijf van duur of datum verandert.
 */
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { planShiftForSegmentEdit } from "../domain/itinerary";
import { ReisplannerDB } from "./db";
import {
  addTransportLeg,
  buildExportDocument,
  deleteTransportLeg,
  importDocument,
  updateSegmentWithShift,
  updateTransportLeg,
} from "./repo";
import { getSeedDocument } from "./seed";

let counter = 0;
const openDbs: ReisplannerDB[] = [];

async function seededDb(): Promise<ReisplannerDB> {
  const db = new ReisplannerDB(`reisplanner-transport-test-${counter++}`);
  openDbs.push(db);
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

describe("transport-CRUD", () => {
  it("voegt een transport toe dat in een geldige export belandt", async () => {
    const db = await seededDb();

    const id = await addTransportLeg(db, TRIP_ID, {
      fromDestinationId: "jp-tokyo",
      toDestinationId: "kr-busan",
      date: "2027-08-23",
      mode: "boot",
      label: "Ferry Shimonoseki – Busan (alternatief)",
      estimatedCost: 180,
      notes: "Nachtboot als vluchtalternatief.",
    });

    expect((await db.transportLegs.get(id))?.mode).toBe("boot");
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });

  it("valideert invoer even streng als de import", async () => {
    const db = await seededDb();

    await expect(
      addTransportLeg(db, TRIP_ID, {
        fromDestinationId: null,
        toDestinationId: null,
        date: "2027-02-30", // bestaat niet
        mode: "trein",
        label: "Fout",
        estimatedCost: null,
        notes: "",
      }),
    ).rejects.toThrow(/Ongeldige invoer/);

    await expect(
      updateTransportLeg(db, TRIP_ID, "tr-ams-beijing", { estimatedCost: -10 }),
    ).rejects.toThrow(/Ongeldige invoer/);
    expect((await db.transportLegs.get("tr-ams-beijing"))?.estimatedCost).toBe(1400);
  });

  it("bewerkt kosten en datum van een bestaand transport", async () => {
    const db = await seededDb();

    await updateTransportLeg(db, TRIP_ID, "tr-kyoto-tokyo", {
      estimatedCost: 210,
      notes: "Groene wagen.",
    });

    const legRecord = await db.transportLegs.get("tr-kyoto-tokyo");
    expect(legRecord?.estimatedCost).toBe(210);
    expect(legRecord?.notes).toBe("Groene wagen.");
  });

  it("verwijderen koppelt budgetposten los en houdt de export geldig", async () => {
    const db = await seededDb();

    // b-vlucht-terug hangt aan tr-seoul-ams.
    await deleteTransportLeg(db, TRIP_ID, "tr-seoul-ams");

    expect(await db.transportLegs.get("tr-seoul-ams")).toBeUndefined();
    expect((await db.budgetItems.get("b-vlucht-terug"))?.transportId).toBeNull();
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });
});

describe("updateSegmentWithShift", () => {
  it("twee nachten langer in Beijing schuift de hele keten twee dagen op", async () => {
    const db = await seededDb();
    const segments = await db.itinerarySegments.where("tripId").equals(TRIP_ID).toArray();
    const transport = await db.transportLegs.where("tripId").equals(TRIP_ID).toArray();

    const shift = planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: "seg-beijing",
      oldStartDate: "2027-05-10",
      oldNights: 7,
      newStartDate: "2027-05-10",
      newNights: 9,
    });
    // 19 andere verblijven en 20 transporten op of na 17 mei (alles behalve de aankomstvlucht).
    expect(shift.segmentChanges).toHaveLength(19);
    expect(shift.transportChanges).toHaveLength(20);

    await updateSegmentWithShift(db, TRIP_ID, "seg-beijing", { nights: 9 }, shift);

    expect((await db.itinerarySegments.get("seg-beijing"))?.nights).toBe(9);
    expect((await db.itinerarySegments.get("seg-xian"))?.startDate).toBe("2027-05-19");
    expect((await db.itinerarySegments.get("seg-seoul"))?.startDate).toBe("2027-09-09");
    expect((await db.transportLegs.get("tr-beijing-xian"))?.date).toBe("2027-05-19");
    expect((await db.transportLegs.get("tr-seoul-ams"))?.date).toBe("2027-09-15");
    // De aankomstvlucht blijft op 10 mei.
    expect((await db.transportLegs.get("tr-ams-beijing"))?.date).toBe("2027-05-10");

    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });

  it("rolt volledig terug wanneer de segment-wijziging zelf ongeldig is", async () => {
    const db = await seededDb();
    const segments = await db.itinerarySegments.where("tripId").equals(TRIP_ID).toArray();
    const transport = await db.transportLegs.where("tripId").equals(TRIP_ID).toArray();

    const shift = planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: "seg-beijing",
      oldStartDate: "2027-05-10",
      oldNights: 7,
      newStartDate: "2027-05-10",
      newNights: 9,
    });

    await expect(
      updateSegmentWithShift(db, TRIP_ID, "seg-beijing", { nights: -9 }, shift),
    ).rejects.toThrow(/Ongeldige invoer/);

    // Niets verschoven.
    expect((await db.itinerarySegments.get("seg-xian"))?.startDate).toBe("2027-05-17");
    expect((await db.transportLegs.get("tr-beijing-xian"))?.date).toBe("2027-05-17");
  });
});
