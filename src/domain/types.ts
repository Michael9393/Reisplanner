/**
 * Domeintypes voor de reisplanner. Dit zijn de interne Dexie-recordvormen;
 * het externe JSON-exportcontract (zonder tripId) staat in schema.ts.
 */

export const STATUSES = ["vast", "kandidaat", "idee"] as const;
export type Status = (typeof STATUSES)[number];

/** Gestandaardiseerde hazard-labels (startset, uitbreidbaar in code). */
export const HAZARDS = ["regen", "hitte", "tyfoon", "kou", "drukte", "hoogseizoen"] as const;
export type Hazard = (typeof HAZARDS)[number];

export const TRANSPORT_MODES = [
  "vlucht",
  "trein",
  "bus",
  "boot",
  "fiets",
  "auto",
  "anders",
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** Seizoensgeschiktheid per halve maand: "YYYY-MM-H1" (dag 1-15) of "YYYY-MM-H2". */
export type SeasonalPeriod = {
  period: string;
  /** 1 = slecht, 5 = uitstekend */
  rating: number;
  hazards: Hazard[];
  note: string;
};

export type TripRecord = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  currency: "EUR";
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  lastExportedAt: string | null;
};

export type DestinationRecord = {
  id: string;
  tripId: string;
  name: string;
  country: string;
  coords: { lat: number; lng: number };
  activities: string[];
  status: Status;
  seasonal: SeasonalPeriod[];
  notes: string;
};

export type ItinerarySegmentRecord = {
  id: string;
  tripId: string;
  destinationId: string;
  startDate: string;
  nights: number;
  status: Status;
  notes: string;
};

export type TransportLegRecord = {
  id: string;
  tripId: string;
  fromDestinationId: string | null;
  toDestinationId: string | null;
  date: string;
  mode: TransportMode;
  label: string;
  estimatedCost: number | null;
  notes: string;
};

export type BudgetCategoryRecord = {
  id: string;
  tripId: string;
  label: string;
};

export type BudgetItemRecord = {
  id: string;
  tripId: string;
  categoryId: string;
  label: string;
  amountPlanned: number;
  amountActual: number | null;
  destinationId: string | null;
  itinerarySegmentId: string | null;
  transportId: string | null;
  originalAmount: number | null;
  originalCurrency: string | null;
  notes: string;
};

export type PackingItemRecord = {
  id: string;
  tripId: string;
  category: string;
  item: string;
  packed: boolean;
  notes: string;
};
