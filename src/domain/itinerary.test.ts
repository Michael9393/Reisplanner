import { describe, expect, it } from "vitest";
import { countriesInTripOrder, planShiftForSegmentEdit, shiftDelta } from "./itinerary";
import type { DestinationRecord, ItinerarySegmentRecord, TransportLegRecord } from "./types";

const tripId = "trip-test";

function segment(
  id: string,
  destinationId: string,
  startDate: string,
  nights: number,
): ItinerarySegmentRecord {
  return { id, tripId, destinationId, startDate, nights, status: "vast", notes: "" };
}

function leg(id: string, date: string): TransportLegRecord {
  return {
    id,
    tripId,
    fromDestinationId: null,
    toDestinationId: null,
    date,
    mode: "trein",
    label: id,
    estimatedCost: null,
    notes: "",
  };
}

function destination(id: string, country: string): DestinationRecord {
  return {
    id,
    tripId,
    name: id,
    country,
    coords: { lat: 0, lng: 0 },
    activities: [],
    status: "vast",
    seasonal: [],
    notes: "",
  };
}

describe("countriesInTripOrder", () => {
  it("volgt de segmentvolgorde en zet landen zonder verblijf alfabetisch achteraan", () => {
    const destinations = [
      destination("d-jp", "Japan"),
      destination("d-cn", "China"),
      destination("d-x", "Bhutan"),
      destination("d-y", "Armenië"),
    ];
    const segments = [
      segment("s1", "d-cn", "2027-05-10", 7),
      segment("s2", "d-jp", "2027-05-17", 7),
    ];
    expect(countriesInTripOrder(destinations, segments)).toEqual([
      "China",
      "Japan",
      "Armenië",
      "Bhutan",
    ]);
  });
});

/**
 * Mini-keten: A (10–17 mei) → B (17–23 mei) → C (23–30 mei), met aankomstleg
 * op 10 mei, wisselingen op 17 en 23 mei, en een leg vóór de keten (9 mei)
 * die nooit mag bewegen.
 */
function fixture() {
  return {
    segments: [
      segment("seg-a", "d-a", "2027-05-10", 7),
      segment("seg-b", "d-b", "2027-05-17", 6),
      segment("seg-c", "d-c", "2027-05-23", 7),
    ],
    transport: [
      leg("tr-voor", "2027-05-09"),
      leg("tr-aankomst-a", "2027-05-10"),
      leg("tr-a-b", "2027-05-17"),
      leg("tr-b-c", "2027-05-23"),
    ],
  };
}

describe("planShiftForSegmentEdit", () => {
  it("langer verblijf: alles na het oude einde schuift mee", () => {
    const { segments, transport } = fixture();
    const shift = planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: "seg-a",
      oldStartDate: "2027-05-10",
      oldNights: 7,
      newStartDate: "2027-05-10",
      newNights: 9,
    });

    expect(shift.segmentChanges).toEqual([
      { id: "seg-b", startDate: "2027-05-19" },
      { id: "seg-c", startDate: "2027-05-25" },
    ]);
    expect(shift.transportChanges).toEqual([
      { id: "tr-a-b", date: "2027-05-19" },
      { id: "tr-b-c", date: "2027-05-25" },
    ]);
  });

  it("korter verblijf: de keten schuift terug", () => {
    const { segments, transport } = fixture();
    const shift = planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: "seg-b",
      oldStartDate: "2027-05-17",
      oldNights: 6,
      newStartDate: "2027-05-17",
      newNights: 3,
    });

    expect(shift.segmentChanges).toEqual([{ id: "seg-c", startDate: "2027-05-20" }]);
    expect(shift.transportChanges).toEqual([{ id: "tr-b-c", date: "2027-05-20" }]);
  });

  it("verblijf verschuiven met gelijke duur: aankomstleg volgt het begin, de rest het einde", () => {
    const { segments, transport } = fixture();
    const shift = planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: "seg-a",
      oldStartDate: "2027-05-10",
      oldNights: 7,
      newStartDate: "2027-05-12",
      newNights: 7,
    });

    expect(shift.transportChanges).toEqual(
      expect.arrayContaining([
        { id: "tr-aankomst-a", date: "2027-05-12" }, // deltaStart
        { id: "tr-a-b", date: "2027-05-19" }, // deltaEnd
        { id: "tr-b-c", date: "2027-05-25" },
      ]),
    );
    expect(shift.segmentChanges).toEqual([
      { id: "seg-b", startDate: "2027-05-19" },
      { id: "seg-c", startDate: "2027-05-25" },
    ]);
  });

  it("geen wijziging betekent geen verschuivingen", () => {
    const { segments, transport } = fixture();
    const shift = planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: "seg-b",
      oldStartDate: "2027-05-17",
      oldNights: 6,
      newStartDate: "2027-05-17",
      newNights: 6,
    });
    expect(shift.segmentChanges).toEqual([]);
    expect(shift.transportChanges).toEqual([]);
  });

  it("alles vóór het bewerkte verblijf blijft staan", () => {
    const { segments, transport } = fixture();
    const shift = planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: "seg-b",
      oldStartDate: "2027-05-17",
      oldNights: 6,
      newStartDate: "2027-05-17",
      newNights: 8,
    });

    const touchedIds = [
      ...shift.segmentChanges.map((c) => c.id),
      ...shift.transportChanges.map((c) => c.id),
    ];
    expect(touchedIds).not.toContain("seg-a");
    expect(touchedIds).not.toContain("tr-voor");
    expect(touchedIds).not.toContain("tr-aankomst-a");
    expect(touchedIds).not.toContain("tr-a-b"); // aankomst van B zelf, vóór het oude einde
  });

  it("shiftDelta geeft de verplaatsing van het ketting-einde", () => {
    expect(
      shiftDelta({
        oldStartDate: "2027-05-10",
        oldNights: 7,
        newStartDate: "2027-05-10",
        newNights: 9,
      }),
    ).toBe(2);
    expect(
      shiftDelta({
        oldStartDate: "2027-05-10",
        oldNights: 7,
        newStartDate: "2027-05-08",
        newNights: 7,
      }),
    ).toBe(-2);
  });
});
