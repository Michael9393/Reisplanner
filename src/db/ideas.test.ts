/**
 * Kladblokbeheer: ideeën toevoegen/bijwerken/verwijderen en transactioneel
 * promoveren tot bestemming — een mislukte promotie laat het idee staan.
 */
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { ReisplannerDB } from "./db";
import {
  addIdea,
  buildExportDocument,
  type DestinationInput,
  deleteIdea,
  importDocument,
  promoteIdea,
  updateIdea,
} from "./repo";
import { getSeedDocument } from "./seed";

let counter = 0;
const openDbs: ReisplannerDB[] = [];

function freshDb(): ReisplannerDB {
  const db = new ReisplannerDB(`reisplanner-idea-test-${counter++}`);
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

describe("addIdea / updateIdea / deleteIdea", () => {
  it("voegt een kaal idee toe (alleen naam) dat in een geldige export belandt", async () => {
    const db = await seededDb();

    const id = await addIdea(db, TRIP_ID, {
      name: "Nikko",
      country: "",
      coords: null,
      notes: "",
      infoUrl: null,
    });

    const stored = await db.ideas.get(id);
    expect(stored?.tripId).toBe(TRIP_ID);
    expect(stored?.createdAt).toBeTruthy();

    const doc = await buildExportDocument(db, TRIP_ID);
    expect(doc.ideas.some((i) => i.name === "Nikko")).toBe(true);
  });

  it("valideert invoer even streng als de import", async () => {
    const db = await seededDb();

    await expect(
      addIdea(db, TRIP_ID, {
        name: "",
        country: "",
        coords: null,
        notes: "",
        infoUrl: null,
      }),
    ).rejects.toThrow(/Ongeldige invoer/);

    await expect(
      addIdea(db, TRIP_ID, {
        name: "Fout",
        country: "",
        coords: null,
        notes: "",
        infoUrl: "http://onveilig.example",
      }),
    ).rejects.toThrow(/Ongeldige invoer/);

    await expect(
      addIdea(db, TRIP_ID, {
        name: "Fout",
        country: "",
        coords: null,
        notes: "",
        infoUrl: null,
        onbekendVeld: true,
      } as never),
    ).rejects.toThrow(/Ongeldige invoer/);

    expect(await db.ideas.count()).toBe(0);
  });

  it("werkt een idee bij en verwijdert het weer", async () => {
    const db = await seededDb();

    const id = await addIdea(db, TRIP_ID, {
      name: "Nikko",
      country: "",
      coords: null,
      notes: "",
      infoUrl: null,
    });

    await updateIdea(db, TRIP_ID, id, {
      country: "Japan",
      coords: { lat: 36.7198, lng: 139.6982 },
      infoUrl: "https://nl.wikipedia.org/wiki/Special:Search?search=Nikko",
    });
    const updated = await db.ideas.get(id);
    expect(updated?.country).toBe("Japan");
    expect(updated?.coords?.lat).toBeCloseTo(36.7198);

    await deleteIdea(db, TRIP_ID, id);
    expect(await db.ideas.get(id)).toBeUndefined();
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });
});

describe("promoteIdea", () => {
  function destinationInput(): DestinationInput {
    return {
      name: "Nikko",
      country: "Japan",
      coords: { lat: 36.7198, lng: 139.6982 },
      activities: ["tempels"],
      status: "idee",
      seasonal: [],
      notes: "Vanuit het kladblok.",
      infoUrl: null,
    };
  }

  it("maakt de bestemming en verwijdert het idee in een transactie", async () => {
    const db = await seededDb();
    const ideaId = await addIdea(db, TRIP_ID, {
      name: "Nikko",
      country: "",
      coords: null,
      notes: "",
      infoUrl: null,
    });

    const destinationId = await promoteIdea(db, TRIP_ID, ideaId, destinationInput());

    expect(await db.ideas.get(ideaId)).toBeUndefined();
    expect((await db.destinations.get(destinationId))?.name).toBe("Nikko");
    await expect(buildExportDocument(db, TRIP_ID)).resolves.toBeTruthy();
  });

  it("laat het idee staan wanneer de bestemmingsinvoer ongeldig is", async () => {
    const db = await seededDb();
    const ideaId = await addIdea(db, TRIP_ID, {
      name: "Nikko",
      country: "",
      coords: null,
      notes: "",
      infoUrl: null,
    });

    await expect(
      promoteIdea(db, TRIP_ID, ideaId, {
        ...destinationInput(),
        coords: { lat: 123, lng: 0 }, // lat buiten bereik
      }),
    ).rejects.toThrow(/Ongeldige invoer/);

    expect(await db.ideas.get(ideaId)).toBeDefined();
    expect(await db.destinations.count()).toBe(21);
  });

  it("weigert een idee dat niet (meer) bestaat", async () => {
    const db = await seededDb();

    await expect(promoteIdea(db, TRIP_ID, "bestaat-niet", destinationInput())).rejects.toThrow(
      /bestaat niet meer/,
    );
    expect(await db.destinations.count()).toBe(21);
  });
});
