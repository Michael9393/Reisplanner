import { useMemo, useState } from "react";
import type { ReisplannerDB } from "../db/db";
import { db } from "../db/db";
import {
  addDestination,
  type DestinationInput,
  deleteDestination,
  updateDestination,
} from "../db/repo";
import { buildSeasonalFromClimate } from "../domain/climate";
import { addDays, formatHalfMonthNL, halfMonthsBetween } from "../domain/dates";
import { countriesInTripOrder } from "../domain/itinerary";
import type {
  DestinationRecord,
  Hazard,
  SeasonalPeriod,
  Status,
  TripRecord,
} from "../domain/types";
import { HAZARDS, STATUSES } from "../domain/types";
import type { TripData } from "../hooks/useTripData";
import { fetchClimateDaily } from "../services/openMeteo";
import { useUIStore } from "../state/ui";
import { PlaceSearchInput } from "./PlaceSearchInput";
import {
  dangerButton,
  inputClass,
  labelClass,
  Modal,
  primaryButton,
  StatusBadge,
  secondaryButton,
} from "./shared";

const RATING_CHIP: Record<number, string> = {
  1: "bg-red-100 text-red-800",
  2: "bg-red-100 text-red-800",
  3: "bg-amber-100 text-amber-800",
  4: "bg-emerald-100 text-emerald-800",
  5: "bg-emerald-100 text-emerald-800",
};

const MONTH_SHORT = new Intl.DateTimeFormat("nl-NL", { month: "short", timeZone: "UTC" });

/** "2027-05-H1" → "beg. mei", "2027-05-H2" → "eind mei" (voor compacte chips). */
function shortPeriodLabel(period: string): string {
  const [year, month, half] = period.split("-");
  const label = MONTH_SHORT.format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
  return `${half === "H1" ? "beg." : "eind"} ${label}`;
}

export function DestinationsView({ data, trip }: { data: TripData; trip: TripRecord }) {
  const { destinations, segments } = data;
  const { editingDestinationId, setEditingDestinationId } = useUIStore();

  const groups = useMemo(() => {
    const byCountry = new Map<string, DestinationRecord[]>();
    for (const dest of destinations) {
      const list = byCountry.get(dest.country) ?? [];
      list.push(dest);
      byCountry.set(dest.country, list);
    }
    return countriesInTripOrder(destinations, segments)
      .filter((country) => byCountry.has(country))
      .map((country) => ({
        country,
        destinations: byCountry.get(country)!.sort((a, b) => a.name.localeCompare(b.name, "nl")),
      }));
  }, [destinations, segments]);

  const segmentCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const segment of segments) {
      counts.set(segment.destinationId, (counts.get(segment.destinationId) ?? 0) + 1);
    }
    return counts;
  }, [segments]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          {destinations.length} bestemmingen · wijzigingen werken direct door in planning, kaart en
          budget
        </p>
        <button
          type="button"
          className={primaryButton}
          onClick={() => setEditingDestinationId("new")}
        >
          + Bestemming toevoegen
        </button>
      </div>

      {groups.map(({ country, destinations: list }) => (
        <section
          key={country}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-2 text-base font-semibold text-slate-800">{country}</h2>
          <ul className="divide-y divide-slate-100">
            {list.map((dest) => (
              <li key={dest.id}>
                <button
                  type="button"
                  onClick={() => setEditingDestinationId(dest.id)}
                  className="flex w-full flex-wrap items-start justify-between gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {dest.name}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {segmentCount.get(dest.id) ?? 0}{" "}
                        {(segmentCount.get(dest.id) ?? 0) === 1 ? "verblijf" : "verblijven"}
                      </span>
                    </p>
                    {dest.activities.length > 0 && (
                      <p className="text-xs text-slate-500">{dest.activities.join(" · ")}</p>
                    )}
                    {dest.notes && (
                      <p className="mt-0.5 max-w-xl truncate text-xs text-slate-400">
                        {dest.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={dest.status} />
                    <div className="flex max-w-72 flex-wrap justify-end gap-1">
                      {dest.seasonal.map((entry) => (
                        <span
                          key={entry.period}
                          className={`rounded px-1.5 py-0.5 text-xs ${RATING_CHIP[entry.rating]}`}
                          title={`${formatHalfMonthNL(entry.period)}: ${entry.rating}/5${entry.hazards.length ? ` (${entry.hazards.join(", ")})` : ""}`}
                        >
                          {shortPeriodLabel(entry.period)} {entry.rating}
                        </span>
                      ))}
                      {dest.seasonal.length === 0 && (
                        <span className="text-xs text-slate-400">geen seizoensdata</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {destinations.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nog geen bestemmingen. Voeg de eerste toe.
        </p>
      )}

      {editingDestinationId !== null && (
        <DestinationEditor
          key={editingDestinationId}
          trip={trip}
          destination={
            editingDestinationId === "new"
              ? null
              : (destinations.find((d) => d.id === editingDestinationId) ?? null)
          }
          existingCountries={[...new Set(destinations.map((d) => d.country))]}
          segmentCount={
            editingDestinationId === "new" ? 0 : (segmentCount.get(editingDestinationId) ?? 0)
          }
          onClose={() => setEditingDestinationId(null)}
        />
      )}
    </div>
  );
}

const COORD_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Editor-rij met een stabiele React-key, los van de (bewerkbare) periode. */
type SeasonalRow = SeasonalPeriod & { rowId: string };

/**
 * Vult de seizoensdata van een net aangemaakte bestemming op de achtergrond
 * met klimaatnormalen — maar alleen zolang er ondertussen geen handwerk is
 * verschenen. Fouten (bv. offline) verdwijnen stil: de lijst toont dan
 * gewoon "geen seizoensdata".
 */
export async function autoFillSeasonal(
  db: ReisplannerDB,
  trip: TripRecord,
  destinationId: string,
  coords: { lat: number; lng: number },
): Promise<void> {
  const result = await fetchClimateDaily(coords);
  if (!result.ok) return;
  const seasonal = buildSeasonalFromClimate(
    result.daily,
    halfMonthsBetween(trip.startDate, trip.endDate),
    coords,
  );
  if (seasonal.length === 0) return;
  const current = await db.destinations.get(destinationId);
  if (!current || current.seasonal.length > 0) return;
  try {
    await updateDestination(db, trip.id, destinationId, { seasonal });
  } catch {
    // Niet-blokkerend: de gebruiker kan de knop in de editor gebruiken.
  }
}

export function DestinationEditor({
  trip,
  destination,
  existingCountries,
  segmentCount,
  onClose,
  initialValues,
  onSave,
}: {
  trip: TripRecord;
  destination: DestinationRecord | null;
  existingCountries: string[];
  segmentCount: number;
  onClose: () => void;
  /** Prefill voor een nieuwe bestemming (bv. promotie vanuit het kladblok). */
  initialValues?: Partial<DestinationInput>;
  /** Vervangt de standaard opslag (add/update), bv. door promoteIdea. */
  onSave?: (input: DestinationInput) => Promise<void>;
}) {
  const [name, setName] = useState(destination?.name ?? initialValues?.name ?? "");
  const [country, setCountry] = useState(destination?.country ?? initialValues?.country ?? "");
  const [lat, setLat] = useState(
    destination
      ? String(destination.coords.lat)
      : initialValues?.coords
        ? String(initialValues.coords.lat)
        : "",
  );
  const [lng, setLng] = useState(
    destination
      ? String(destination.coords.lng)
      : initialValues?.coords
        ? String(initialValues.coords.lng)
        : "",
  );
  const [activities, setActivities] = useState(
    destination?.activities.join(", ") ?? initialValues?.activities?.join(", ") ?? "",
  );
  const [status, setStatus] = useState<Status>(
    destination?.status ?? initialValues?.status ?? "kandidaat",
  );
  const [notes, setNotes] = useState(destination?.notes ?? initialValues?.notes ?? "");
  const [infoUrl, setInfoUrl] = useState<string | null>(
    destination?.infoUrl ?? initialValues?.infoUrl ?? null,
  );
  const [fetchingSeason, setFetchingSeason] = useState(false);
  const [seasonal, setSeasonal] = useState<SeasonalRow[]>(
    (destination?.seasonal ?? initialValues?.seasonal ?? []).map((s) => ({
      ...s,
      hazards: [...s.hazards],
      rowId: crypto.randomUUID(),
    })),
  );
  const [error, setError] = useState<string | null>(null);

  // Reisvenster ± 1 maand, aangevuld met al gebruikte periodes daarbuiten.
  const periodOptions = useMemo(() => {
    const options = halfMonthsBetween(addDays(trip.startDate, -31), addDays(trip.endDate, 31));
    for (const entry of seasonal) {
      if (!options.includes(entry.period)) options.push(entry.period);
    }
    return options.sort();
  }, [trip.startDate, trip.endDate, seasonal]);

  function updatePeriod(index: number, patch: Partial<SeasonalPeriod>) {
    setSeasonal((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  }

  function toggleHazard(index: number, hazard: Hazard) {
    setSeasonal((current) =>
      current.map((entry, i) => {
        if (i !== index) return entry;
        const active = entry.hazards.includes(hazard);
        return {
          ...entry,
          hazards: active ? entry.hazards.filter((h) => h !== hazard) : [...entry.hazards, hazard],
        };
      }),
    );
  }

  function addPeriod() {
    const used = new Set(seasonal.map((entry) => entry.period));
    const next = periodOptions.find((period) => !used.has(period)) ?? periodOptions[0];
    setSeasonal((current) => [
      ...current,
      { period: next, rating: 3, hazards: [], note: "", rowId: crypto.randomUUID() },
    ]);
  }

  /** Een geplakt "lat, lng"-paar in het breedtegraad-veld splitst automatisch. */
  function onLatChange(value: string) {
    const pair = COORD_PAIR.exec(value);
    if (pair) {
      setLat(pair[1]);
      setLng(pair[2]);
    } else {
      setLat(value);
    }
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasValidCoords =
    lat.trim() !== "" &&
    lng.trim() !== "" &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    Math.abs(latNum) <= 90 &&
    Math.abs(lngNum) <= 180;

  /** Haalt klimaatnormalen op en vervangt de seizoenslijst — na bevestiging. */
  async function fetchSeasonal() {
    if (!hasValidCoords || fetchingSeason) return;
    if (
      seasonal.length > 0 &&
      !window.confirm(
        "Er staan al seizoensperiodes. Vervangen door automatisch opgehaalde klimaatdata?",
      )
    ) {
      return;
    }
    setFetchingSeason(true);
    setError(null);
    const coords = { lat: latNum, lng: lngNum };
    const result = await fetchClimateDaily(coords);
    setFetchingSeason(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const generated = buildSeasonalFromClimate(
      result.daily,
      halfMonthsBetween(trip.startDate, trip.endDate),
      coords,
    );
    if (generated.length === 0) {
      setError("Geen klimaatdata beschikbaar voor deze locatie.");
      return;
    }
    setSeasonal(generated.map((entry) => ({ ...entry, rowId: crypto.randomUUID() })));
  }

  async function save() {
    if (name.trim() === "") return setError("Geef de bestemming een naam.");
    if (country.trim() === "") return setError("Vul een land in.");
    if (
      lat.trim() === "" ||
      lng.trim() === "" ||
      !Number.isFinite(latNum) ||
      !Number.isFinite(lngNum)
    ) {
      return setError(
        "Coördinaten zijn verplicht en moeten getallen zijn (met een punt als decimaalteken).",
      );
    }
    if (Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
      return setError("Breedtegraad moet tussen -90 en 90 liggen, lengtegraad tussen -180 en 180.");
    }
    const periods = seasonal.map((entry) => entry.period);
    if (new Set(periods).size !== periods.length) {
      return setError("Elke seizoensperiode mag maar één keer voorkomen.");
    }

    const input: DestinationInput = {
      name: name.trim(),
      country: country.trim(),
      coords: { lat: latNum, lng: lngNum },
      activities: activities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      status,
      seasonal: seasonal
        .map(({ rowId: _rowId, ...entry }) => entry)
        .sort((a, b) => a.period.localeCompare(b.period)),
      notes,
      infoUrl,
    };
    try {
      if (onSave) {
        await onSave(input);
      } else if (destination) {
        await updateDestination(db, trip.id, destination.id, input);
      } else {
        const newId = await addDestination(db, trip.id, input);
        // Lege seizoenslijst? Vul die op de achtergrond met klimaatdata;
        // dit blokkeert het sluiten niet en overschrijft nooit handwerk.
        if (input.seasonal.length === 0) {
          void autoFillSeasonal(db, trip, newId, input.coords);
        }
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    if (!destination) return;
    if (
      !window.confirm(
        `Bestemming "${destination.name}" verwijderen? Transport- en budgetposten die ernaar verwijzen worden losgekoppeld.`,
      )
    ) {
      return;
    }
    try {
      await deleteDestination(db, trip.id, destination.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal title={destination ? "Bestemming bewerken" : "Nieuwe bestemming"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="dest-name">
              Naam
            </label>
            <PlaceSearchInput
              id="dest-name"
              value={name}
              onChange={setName}
              onSelect={(suggestion) => {
                setName(suggestion.name);
                setLat(String(suggestion.coords.lat));
                setLng(String(suggestion.coords.lng));
                if (suggestion.country && country.trim() === "") setCountry(suggestion.country);
                setInfoUrl(suggestion.infoUrl);
              }}
              placeholder="bijv. Nikko"
            />
            {infoUrl && (
              <p className="mt-1 flex items-center gap-1.5 text-xs">
                <a
                  href={infoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 underline hover:text-emerald-900"
                >
                  Wikipedia ↗
                </a>
                <button
                  type="button"
                  onClick={() => setInfoUrl(null)}
                  className="rounded px-1 text-slate-400 hover:text-red-500"
                  aria-label="Link verwijderen"
                >
                  ✕
                </button>
              </p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="dest-country">
              Land
            </label>
            <input
              id="dest-country"
              className={inputClass}
              list="dest-countries"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
            <datalist id="dest-countries">
              {existingCountries.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="dest-lat">
              Breedtegraad (lat)
            </label>
            <input
              id="dest-lat"
              className={inputClass}
              inputMode="decimal"
              value={lat}
              onChange={(e) => onLatChange(e.target.value)}
              placeholder="36.7198 of plak “lat, lng”"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="dest-lng">
              Lengtegraad (lng)
            </label>
            <input
              id="dest-lng"
              className={inputClass}
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="139.6982"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="dest-activities">
              Activiteiten (komma-gescheiden)
            </label>
            <input
              id="dest-activities"
              className={inputClass}
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              placeholder="tempels, wandelen"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="dest-status">
              Status
            </label>
            <select
              id="dest-status"
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="dest-notes">
            Notities
          </label>
          <textarea
            id="dest-notes"
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-600">
              Seizoen per halve maand (1 = slecht, 5 = uitstekend)
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={fetchSeasonal}
                disabled={!hasValidCoords || fetchingSeason}
                title={
                  hasValidCoords
                    ? "Klimaatnormalen (Open-Meteo, 2015–2024) omzetten naar ratings per halve maand"
                    : "Vul eerst geldige coördinaten in"
                }
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                {fetchingSeason ? "Ophalen…" : "Seizoensdata ophalen"}
              </button>
              <button
                type="button"
                onClick={addPeriod}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                + Periode
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {seasonal.map((entry, index) => (
              <div key={entry.rowId} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Periode"
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={entry.period}
                    onChange={(e) => updatePeriod(index, { period: e.target.value })}
                  >
                    {periodOptions.map((period) => (
                      <option key={period} value={period}>
                        {formatHalfMonthNL(period)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Rating"
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={entry.rating}
                    onChange={(e) => updatePeriod(index, { rating: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}/5
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSeasonal((current) => current.filter((_, i) => i !== index))}
                    className="ml-auto rounded p-1 text-slate-400 hover:text-red-500"
                    aria-label="Periode verwijderen"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {HAZARDS.map((hazard) => {
                    const active = entry.hazards.includes(hazard);
                    return (
                      <button
                        key={hazard}
                        type="button"
                        onClick={() => toggleHazard(index, hazard)}
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          active
                            ? hazard === "tyfoon"
                              ? "bg-red-600 text-white"
                              : "bg-slate-700 text-white"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                        aria-pressed={active}
                      >
                        {hazard}
                      </button>
                    );
                  })}
                </div>
                <input
                  aria-label="Seizoensnotitie"
                  className="mt-1.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  placeholder="Korte toelichting (optioneel)"
                  value={entry.note}
                  onChange={(e) => updatePeriod(index, { note: e.target.value })}
                />
              </div>
            ))}
            {seasonal.length === 0 && (
              <p className="text-xs text-slate-400">
                Nog geen seizoensdata; de planning toont dan “seizoen onbekend”.
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between pt-1">
          {destination ? (
            <button
              type="button"
              className={dangerButton}
              onClick={remove}
              title={
                segmentCount > 0
                  ? `Let op: ${segmentCount} verblijven verwijzen naar deze bestemming`
                  : undefined
              }
            >
              Verwijderen
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className={secondaryButton} onClick={onClose}>
              Annuleren
            </button>
            <button type="button" className={primaryButton} onClick={save}>
              Opslaan
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
