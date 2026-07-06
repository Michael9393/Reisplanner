import type { ReactNode } from "react";
import type { Hazard, Status, TransportMode } from "../domain/types";
import type { SeasonAssessment } from "../domain/season";
import { hasSeasonWarning } from "../domain/season";

export const STATUS_STYLE: Record<Status, string> = {
  vast: "bg-emerald-100 text-emerald-800 border-emerald-200",
  kandidaat: "bg-amber-100 text-amber-800 border-amber-200",
  idee: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Markerkleuren op de kaart, in lijn met de statusbadges. */
export const STATUS_COLOR: Record<Status, string> = {
  vast: "#059669",
  kandidaat: "#d97706",
  idee: "#64748b",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

export const MODE_ICON: Record<TransportMode, string> = {
  vlucht: "✈️",
  trein: "🚄",
  bus: "🚌",
  boot: "⛴️",
  fiets: "🚴",
  auto: "🚗",
  anders: "➡️",
};

const HAZARD_LABEL: Record<Hazard, string> = {
  regen: "🌧 regen",
  hitte: "🌡 hitte",
  tyfoon: "🌀 tyfoon",
  kou: "❄️ kou",
  drukte: "👥 drukte",
  hoogseizoen: "📈 hoogseizoen",
};

export function HazardChips({ hazards }: { hazards: Hazard[] }) {
  if (hazards.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {hazards.map((hazard) => (
        <span
          key={hazard}
          className={`rounded px-1.5 py-0.5 text-xs ${
            hazard === "tyfoon" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {HAZARD_LABEL[hazard]}
        </span>
      ))}
    </span>
  );
}

const RATING_STYLE = [
  "", // rating 0 bestaat niet
  "bg-red-100 text-red-800",
  "bg-red-100 text-red-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-emerald-100 text-emerald-800",
];

/** Compacte seizoensweergave: laagste rating + hazards + evt. waarschuwing. */
export function SeasonSummary({ assessment }: { assessment: SeasonAssessment }) {
  if (assessment.minRating === null) {
    return <span className="text-xs text-slate-400">seizoen onbekend</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-semibold ${RATING_STYLE[assessment.minRating]}`}
        title="Laagste seizoensrating in deze periode (1 = slecht, 5 = uitstekend)"
      >
        seizoen {assessment.minRating}/5
      </span>
      <HazardChips hazards={assessment.hazards} />
      {hasSeasonWarning(assessment) && (
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          ⚠ ongunstig venster
        </span>
      )}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
export const labelClass = "mb-1 block text-xs font-medium text-slate-600";
export const primaryButton =
  "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
export const secondaryButton =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
export const dangerButton =
  "rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50";
