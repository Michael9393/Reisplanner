import { useMemo, useState } from "react";
import { db } from "../db/db";
import {
  addSegment,
  addTransportLeg,
  deleteSegment,
  deleteTransportLeg,
  type SegmentInput,
  type TransportInput,
  updateSegment,
  updateSegmentWithShift,
  updateTransportLeg,
} from "../db/repo";
import {
  addDays,
  diffDays,
  formatDateNL,
  formatDayMonthNL,
  isValidISODate,
  tripWeekNumber,
} from "../domain/dates";
import { formatEuro } from "../domain/format";
import { planShiftForSegmentEdit, shiftDelta } from "../domain/itinerary";
import { assessSeason, hasSeasonWarning } from "../domain/season";
import type {
  DestinationRecord,
  ItinerarySegmentRecord,
  TransportLegRecord,
  TransportMode,
  TripRecord,
} from "../domain/types";
import { STATUSES, TRANSPORT_MODES } from "../domain/types";
import type { TripData } from "../hooks/useTripData";
import { useUIStore } from "../state/ui";
import {
  dangerButton,
  inputClass,
  labelClass,
  MODE_ICON,
  Modal,
  primaryButton,
  SeasonSummary,
  StatusBadge,
  secondaryButton,
} from "./shared";

type TimelineEntry =
  | { kind: "segment"; date: string; segment: ItinerarySegmentRecord }
  | { kind: "transport"; date: string; leg: TransportLegRecord };

export function PlanningView({ data, trip }: { data: TripData; trip: TripRecord }) {
  const { destinations, segments, transport } = data;
  const { editingSegmentId, setEditingSegmentId, editingTransportId, setEditingTransportId } =
    useUIStore();

  const destinationById = useMemo(
    () => new Map(destinations.map((d) => [d.id, d])),
    [destinations],
  );

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...transport.map((leg) => ({ kind: "transport" as const, date: leg.date, leg })),
      ...segments.map((segment) => ({
        kind: "segment" as const,
        date: segment.startDate,
        segment,
      })),
    ];
    // Op dezelfde dag eerst het transport, dan het verblijf.
    const kindOrder = { transport: 0, segment: 1 } as const;
    return entries.sort(
      (a, b) => a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind],
    );
  }, [segments, transport]);

  const totalNights = segments.reduce((sum, s) => sum + s.nights, 0);
  const tripNights = diffDays(trip.startDate, trip.endDate);
  const warningCount = segments.filter((s) =>
    hasSeasonWarning(assessSeason(destinationById.get(s.destinationId), s.startDate, s.nights)),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-6 text-sm">
          <Stat label="Nachten gepland" value={`${totalNights} / ${tripNights}`} />
          <Stat label="Segmenten" value={String(segments.length)} />
          <Stat
            label="Seizoenswaarschuwingen"
            value={String(warningCount)}
            tone={warningCount > 0 ? "warn" : "ok"}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setEditingTransportId("new")}
          >
            + Transport
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => setEditingSegmentId("new")}
          >
            + Segment toevoegen
          </button>
        </div>
      </div>

      {totalNights !== tripNights && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          De geplande nachten ({totalNights}) wijken af van de reisduur ({tripNights} nachten van{" "}
          {formatDayMonthNL(trip.startDate)} tot {formatDayMonthNL(trip.endDate)}).
        </p>
      )}

      <ol className="space-y-2">
        {timeline.map((entry, index) => {
          if (entry.kind === "transport") {
            return (
              <TransportRow
                key={`t-${entry.leg.id}`}
                leg={entry.leg}
                onEdit={() => setEditingTransportId(entry.leg.id)}
              />
            );
          }
          const previousSegment = findPreviousSegment(timeline, index);
          return (
            <li key={entry.segment.id}>
              <ConnectionIssue previous={previousSegment} current={entry.segment} />
              <SegmentCard
                segment={entry.segment}
                destination={destinationById.get(entry.segment.destinationId)}
                trip={trip}
                onEdit={() => setEditingSegmentId(entry.segment.id)}
              />
            </li>
          );
        })}
      </ol>

      {segments.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nog geen segmenten. Voeg het eerste verblijf toe.
        </p>
      )}

      {editingSegmentId !== null && (
        <SegmentEditor
          key={editingSegmentId}
          trip={trip}
          destinations={destinations}
          segments={segments}
          transport={transport}
          segment={
            editingSegmentId === "new"
              ? null
              : (segments.find((s) => s.id === editingSegmentId) ?? null)
          }
          suggestedStartDate={
            segments.length > 0
              ? addDays(
                  segments[segments.length - 1].startDate,
                  segments[segments.length - 1].nights,
                )
              : trip.startDate
          }
          onClose={() => setEditingSegmentId(null)}
        />
      )}

      {editingTransportId !== null && (
        <TransportEditor
          key={editingTransportId}
          trip={trip}
          destinations={destinations}
          leg={
            editingTransportId === "new"
              ? null
              : (transport.find((t) => t.id === editingTransportId) ?? null)
          }
          suggestedDate={
            segments.length > 0
              ? addDays(
                  segments[segments.length - 1].startDate,
                  segments[segments.length - 1].nights,
                )
              : trip.startDate
          }
          onClose={() => setEditingTransportId(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-lg font-semibold ${
          tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-700" : "text-slate-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function findPreviousSegment(
  timeline: TimelineEntry[],
  index: number,
): ItinerarySegmentRecord | null {
  for (let i = index - 1; i >= 0; i--) {
    const entry = timeline[i];
    if (entry.kind === "segment") return entry.segment;
  }
  return null;
}

/** Signaleert een gat of overlap tussen twee opeenvolgende verblijven. */
function ConnectionIssue({
  previous,
  current,
}: {
  previous: ItinerarySegmentRecord | null;
  current: ItinerarySegmentRecord;
}) {
  if (!previous) return null;
  const previousEnd = addDays(previous.startDate, previous.nights);
  const difference = diffDays(previousEnd, current.startDate);
  if (difference === 0) return null;
  return (
    <p
      className={`mb-2 rounded-lg border px-3 py-1.5 text-xs ${
        difference > 0
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {difference > 0
        ? `Gat van ${difference} ${difference === 1 ? "nacht" : "nachten"} vóór dit verblijf.`
        : `Overlap van ${-difference} ${difference === -1 ? "nacht" : "nachten"} met het vorige verblijf.`}
    </p>
  );
}

function TransportRow({ leg, onEdit }: { leg: TransportLegRecord; onEdit: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-1 text-left text-sm text-slate-500 hover:bg-white hover:text-slate-700"
      >
        <span aria-hidden>{MODE_ICON[leg.mode]}</span>
        <span className="text-xs text-slate-400">{formatDateNL(leg.date)}</span>
        <span>{leg.label}</span>
        {leg.estimatedCost !== null && (
          <span className="text-xs text-slate-400">± {formatEuro(leg.estimatedCost)}</span>
        )}
      </button>
    </li>
  );
}

function SegmentCard({
  segment,
  destination,
  trip,
  onEdit,
}: {
  segment: ItinerarySegmentRecord;
  destination: DestinationRecord | undefined;
  trip: TripRecord;
  onEdit: () => void;
}) {
  const endDate = addDays(segment.startDate, segment.nights);
  const assessment = assessSeason(destination, segment.startDate, segment.nights);
  const week = tripWeekNumber(trip.startDate, segment.startDate);

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="w-24 shrink-0">
            <p className="text-xs font-semibold uppercase text-slate-400">week {week}</p>
            <p className="text-sm font-medium text-slate-700">
              {formatDayMonthNL(segment.startDate)} – {formatDayMonthNL(endDate)}
            </p>
            <p className="text-xs text-slate-400">
              {segment.nights} {segment.nights === 1 ? "nacht" : "nachten"}
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">
              {destination ? destination.name : `Onbekende bestemming (${segment.destinationId})`}
            </p>
            <p className="text-xs text-slate-500">{destination?.country}</p>
            {segment.notes && <p className="mt-1 text-xs text-slate-500">{segment.notes}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={segment.status} />
          <SeasonSummary assessment={assessment} />
        </div>
      </div>
    </button>
  );
}

/** Groepeert bestemmingen per land voor een select met optgroups. */
function groupDestinationsByCountry(
  destinations: DestinationRecord[],
): [string, DestinationRecord[]][] {
  const groups = new Map<string, DestinationRecord[]>();
  for (const dest of [...destinations].sort((a, b) => a.name.localeCompare(b.name, "nl"))) {
    const list = groups.get(dest.country) ?? [];
    list.push(dest);
    groups.set(dest.country, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
}

function SegmentEditor({
  trip,
  destinations,
  segments,
  transport,
  segment,
  suggestedStartDate,
  onClose,
}: {
  trip: TripRecord;
  destinations: DestinationRecord[];
  segments: ItinerarySegmentRecord[];
  transport: TransportLegRecord[];
  segment: ItinerarySegmentRecord | null;
  suggestedStartDate: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<SegmentInput>({
    destinationId: segment?.destinationId ?? destinations[0]?.id ?? "",
    startDate: segment?.startDate ?? suggestedStartDate,
    nights: segment?.nights ?? 5,
    status: segment?.status ?? "kandidaat",
    notes: segment?.notes ?? "",
  });
  const [shiftFollowing, setShiftFollowing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const byCountry = useMemo(() => groupDestinationsByCountry(destinations), [destinations]);

  const previewDestination = destinations.find((d) => d.id === form.destinationId);
  const preview = assessSeason(previewDestination, form.startDate, form.nights);

  // Kettingverschuiving: wat zou er meebewegen met de huidige formulierwaarden?
  const shift = useMemo(() => {
    if (!segment || !isValidISODate(form.startDate)) return null;
    return planShiftForSegmentEdit({
      segments,
      transport,
      segmentId: segment.id,
      oldStartDate: segment.startDate,
      oldNights: segment.nights,
      newStartDate: form.startDate,
      newNights: form.nights,
    });
  }, [segment, segments, transport, form.startDate, form.nights]);
  const shiftCount = shift ? shift.segmentChanges.length + shift.transportChanges.length : 0;
  const delta =
    segment && isValidISODate(form.startDate)
      ? shiftDelta({
          oldStartDate: segment.startDate,
          oldNights: segment.nights,
          newStartDate: form.startDate,
          newNights: form.nights,
        })
      : 0;

  async function save() {
    if (!form.destinationId) {
      setError("Kies een bestemming.");
      return;
    }
    if (!form.startDate) {
      setError("Kies een startdatum.");
      return;
    }
    try {
      if (segment) {
        if (shiftFollowing && shift && shiftCount > 0) {
          await updateSegmentWithShift(db, trip.id, segment.id, form, shift);
        } else {
          await updateSegment(db, trip.id, segment.id, form);
        }
      } else {
        await addSegment(db, trip.id, form);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    if (!segment) return;
    if (
      !window.confirm(
        "Dit verblijf verwijderen? Gekoppelde budgetposten blijven bestaan als globale post.",
      )
    ) {
      return;
    }
    await deleteSegment(db, trip.id, segment.id);
    onClose();
  }

  return (
    <Modal title={segment ? "Verblijf bewerken" : "Nieuw verblijf"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelClass} htmlFor="segment-destination">
            Bestemming
          </label>
          <select
            id="segment-destination"
            className={inputClass}
            value={form.destinationId}
            onChange={(e) => setForm({ ...form, destinationId: e.target.value })}
          >
            {byCountry.map(([country, list]) => (
              <optgroup key={country} label={country}>
                {list.map((dest) => (
                  <option key={dest.id} value={dest.id}>
                    {dest.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="segment-start">
              Startdatum
            </label>
            <input
              id="segment-start"
              type="date"
              className={inputClass}
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="segment-nights">
              Nachten
            </label>
            <input
              id="segment-nights"
              type="number"
              min={0}
              className={inputClass}
              value={form.nights}
              onChange={(e) =>
                setForm({ ...form, nights: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
              }
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="segment-status">
            Status
          </label>
          <select
            id="segment-status"
            className={inputClass}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as SegmentInput["status"] })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="segment-notes">
            Notities
          </label>
          <textarea
            id="segment-notes"
            className={inputClass}
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-slate-500">Seizoen in deze periode</p>
          <SeasonSummary assessment={preview} />
          {preview.periods.map((period) => (
            <p key={period.period} className="mt-1 text-xs text-slate-500">
              {period.note}
            </p>
          ))}
        </div>

        {segment && shift && shiftCount > 0 && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <input
              type="checkbox"
              checked={shiftFollowing}
              onChange={(e) => setShiftFollowing(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <span className="text-sm text-amber-900">
              Verschuif de rest van de reis mee: {shift.segmentChanges.length}{" "}
              {shift.segmentChanges.length === 1 ? "verblijf" : "verblijven"} en{" "}
              {shift.transportChanges.length}{" "}
              {shift.transportChanges.length === 1 ? "transport" : "transporten"}
              {delta !== 0 && (
                <>
                  {" "}
                  {delta > 0 ? `${delta} ${delta === 1 ? "dag" : "dagen"} later` : ""}
                  {delta < 0 ? `${-delta} ${delta === -1 ? "dag" : "dagen"} eerder` : ""}
                </>
              )}
              .
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between pt-1">
          {segment ? (
            <button type="button" className={dangerButton} onClick={remove}>
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

function TransportEditor({
  trip,
  destinations,
  leg,
  suggestedDate,
  onClose,
}: {
  trip: TripRecord;
  destinations: DestinationRecord[];
  leg: TransportLegRecord | null;
  suggestedDate: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(leg?.date ?? suggestedDate);
  const [mode, setMode] = useState<TransportMode>(leg?.mode ?? "trein");
  const [fromId, setFromId] = useState(leg?.fromDestinationId ?? "");
  const [toId, setToId] = useState(leg?.toDestinationId ?? "");
  const [label, setLabel] = useState(leg?.label ?? "");
  const [cost, setCost] = useState(leg?.estimatedCost?.toString() ?? "");
  const [notes, setNotes] = useState(leg?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const byCountry = useMemo(() => groupDestinationsByCountry(destinations), [destinations]);
  const nameOf = (id: string) => destinations.find((d) => d.id === id)?.name;
  const labelSuggestion =
    fromId && toId ? `${nameOf(fromId)} – ${nameOf(toId)}` : "bijv. Shinkansen Kyoto – Tokyo";

  async function save() {
    if (!date) return setError("Kies een datum.");
    const trimmedLabel = label.trim() || (fromId && toId ? labelSuggestion : "");
    if (!trimmedLabel) return setError("Geef het transport een omschrijving.");
    const trimmedCost = cost.trim();
    const costValue = trimmedCost === "" ? null : Number(trimmedCost.replace(",", "."));
    if (costValue !== null && (!Number.isFinite(costValue) || costValue < 0)) {
      return setError("Geschatte kosten zijn ongeldig.");
    }

    const input: TransportInput = {
      fromDestinationId: fromId || null,
      toDestinationId: toId || null,
      date,
      mode,
      label: trimmedLabel,
      estimatedCost: costValue,
      notes,
    };
    try {
      if (leg) {
        await updateTransportLeg(db, trip.id, leg.id, input);
      } else {
        await addTransportLeg(db, trip.id, input);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    if (!leg) return;
    if (
      !window.confirm(
        `Transport "${leg.label}" verwijderen? Budgetposten die ernaar verwijzen worden losgekoppeld.`,
      )
    ) {
      return;
    }
    try {
      await deleteTransportLeg(db, trip.id, leg.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function destinationSelect(
    id: string,
    value: string,
    onChange: (value: string) => void,
    ariaLabel: string,
  ) {
    return (
      <select
        id={id}
        aria-label={ariaLabel}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— buiten de reis —</option>
        {byCountry.map(([country, list]) => (
          <optgroup key={country} label={country}>
            {list.map((dest) => (
              <option key={dest.id} value={dest.id}>
                {dest.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }

  return (
    <Modal title={leg ? "Transport bewerken" : "Nieuw transport"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="transport-date">
              Datum
            </label>
            <input
              id="transport-date"
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="transport-mode">
              Vervoer
            </label>
            <select
              id="transport-mode"
              className={inputClass}
              value={mode}
              onChange={(e) => setMode(e.target.value as TransportMode)}
            >
              {TRANSPORT_MODES.map((transportMode) => (
                <option key={transportMode} value={transportMode}>
                  {MODE_ICON[transportMode]} {transportMode}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="transport-from">
              Van
            </label>
            {destinationSelect("transport-from", fromId, setFromId, "Vertrekbestemming")}
          </div>
          <div>
            <label className={labelClass} htmlFor="transport-to">
              Naar
            </label>
            {destinationSelect("transport-to", toId, setToId, "Aankomstbestemming")}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="transport-label">
            Omschrijving
          </label>
          <input
            id="transport-label"
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={labelSuggestion}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="transport-cost">
            Geschatte kosten (€, leeg = onbekend)
          </label>
          <input
            id="transport-cost"
            className={inputClass}
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="transport-notes">
            Notities
          </label>
          <textarea
            id="transport-notes"
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between pt-1">
          {leg ? (
            <button type="button" className={dangerButton} onClick={remove}>
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
