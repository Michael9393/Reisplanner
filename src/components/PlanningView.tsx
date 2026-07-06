import { useMemo, useState } from "react";
import { db } from "../db/db";
import type { TripData } from "../hooks/useTripData";
import { useUIStore } from "../state/ui";
import type {
  DestinationRecord,
  ItinerarySegmentRecord,
  TransportLegRecord,
  TripRecord,
} from "../domain/types";
import { STATUSES } from "../domain/types";
import { addDays, diffDays, formatDateNL, formatDayMonthNL, tripWeekNumber } from "../domain/dates";
import { assessSeason, hasSeasonWarning } from "../domain/season";
import { formatEuro } from "../domain/format";
import { addSegment, deleteSegment, updateSegment, type SegmentInput } from "../db/repo";
import {
  Modal,
  MODE_ICON,
  SeasonSummary,
  StatusBadge,
  dangerButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "./shared";

type TimelineEntry =
  | { kind: "segment"; date: string; segment: ItinerarySegmentRecord }
  | { kind: "transport"; date: string; leg: TransportLegRecord };

export function PlanningView({ data, trip }: { data: TripData; trip: TripRecord }) {
  const { destinations, segments, transport } = data;
  const { editingSegmentId, setEditingSegmentId } = useUIStore();

  const destinationById = useMemo(
    () => new Map(destinations.map((d) => [d.id, d])),
    [destinations],
  );

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...transport.map((leg) => ({ kind: "transport" as const, date: leg.date, leg })),
      ...segments.map((segment) => ({ kind: "segment" as const, date: segment.startDate, segment })),
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
        <button type="button" className={primaryButton} onClick={() => setEditingSegmentId("new")}>
          + Segment toevoegen
        </button>
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
            return <TransportRow key={`t-${entry.leg.id}`} leg={entry.leg} />;
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

function TransportRow({ leg }: { leg: TransportLegRecord }) {
  return (
    <li className="flex items-center gap-3 px-4 py-1 text-sm text-slate-500">
      <span aria-hidden>{MODE_ICON[leg.mode]}</span>
      <span className="text-xs text-slate-400">{formatDateNL(leg.date)}</span>
      <span>{leg.label}</span>
      {leg.estimatedCost !== null && (
        <span className="text-xs text-slate-400">± {formatEuro(leg.estimatedCost)}</span>
      )}
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

function SegmentEditor({
  trip,
  destinations,
  segment,
  suggestedStartDate,
  onClose,
}: {
  trip: TripRecord;
  destinations: DestinationRecord[];
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
  const [error, setError] = useState<string | null>(null);

  const byCountry = useMemo(() => {
    const groups = new Map<string, DestinationRecord[]>();
    for (const dest of [...destinations].sort((a, b) => a.name.localeCompare(b.name, "nl"))) {
      const list = groups.get(dest.country) ?? [];
      list.push(dest);
      groups.set(dest.country, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
  }, [destinations]);

  const previewDestination = destinations.find((d) => d.id === form.destinationId);
  const preview = assessSeason(previewDestination, form.startDate, form.nights);

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
        await updateSegment(db, trip.id, segment.id, form);
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
    if (!window.confirm("Dit verblijf verwijderen? Gekoppelde budgetposten blijven bestaan als globale post.")) {
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
