import { useEffect, useState } from "react";
import { db } from "./db/db";
import { loadSeedIfEmpty } from "./db/seed";
import { useTripData } from "./hooks/useTripData";
import type { TripRecord } from "./domain/types";
import { TABS, useUIStore } from "./state/ui";
import { formatDateFullNL } from "./domain/dates";
import { formatTimestampNL } from "./domain/format";
import { PlanningView } from "./components/PlanningView";
import { MapView } from "./components/MapView";
import { BudgetView } from "./components/BudgetView";
import { PackingView } from "./components/PackingView";
import { DataView, ImportPanel, useExportAction } from "./components/DataView";
import { primaryButton } from "./components/shared";

export default function App() {
  const [seedError, setSeedError] = useState<string | null>(null);
  const data = useTripData();
  const { tab, setTab } = useUIStore();

  useEffect(() => {
    loadSeedIfEmpty(db).catch((error: unknown) => {
      setSeedError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  const { trip } = data;

  if (seedError) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">De voorbeeldreis kon niet geladen worden.</p>
          <p className="mt-1">{seedError}</p>
        </div>
      </div>
    );
  }

  if (trip === undefined) {
    return <div className="p-8 text-sm text-slate-500">Reis laden…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header trip={trip} />
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                tab === id
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {trip === null ? (
          <EmptyState />
        ) : (
          <>
            {tab === "planning" && <PlanningView data={data} trip={trip} />}
            {tab === "kaart" && <MapView data={data} />}
            {tab === "budget" && <BudgetView data={data} trip={trip} />}
            {tab === "paklijst" && <PackingView data={data} trip={trip} />}
            {tab === "data" && <DataView data={data} trip={trip} />}
          </>
        )}
      </main>
    </div>
  );
}

function Header({ trip }: { trip: TripRecord | null }) {
  const exportAction = useExportAction(trip);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {trip ? trip.title : "Reisplanner"}
          </h1>
          {trip && (
            <p className="text-sm text-slate-500">
              {formatDateFullNL(trip.startDate)} – {formatDateFullNL(trip.endDate)} ·{" "}
              {trip.durationWeeks} weken
            </p>
          )}
        </div>
        {trip && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-xs text-slate-400 sm:block">
              <p>Opgeslagen: {formatTimestampNL(trip.updatedAt)}</p>
              <p>
                Geëxporteerd:{" "}
                {trip.lastExportedAt ? (
                  formatTimestampNL(trip.lastExportedAt)
                ) : (
                  <span className="font-semibold text-amber-600">nog nooit</span>
                )}
              </p>
            </div>
            <button type="button" onClick={exportAction.run} className={primaryButton}>
              Exporteren
            </button>
          </div>
        )}
      </div>
      {exportAction.message && (
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <p className="text-xs text-emerald-700">{exportAction.message}</p>
        </div>
      )}
    </header>
  );
}

function EmptyState() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-center text-lg font-semibold">Geen reis in de lokale opslag</h2>
      <p className="mt-2 text-center text-sm text-slate-500">
        Laad de voorbeeldreis, of herstel je eigen planning uit een eerder geëxporteerd
        JSON-bestand.
      </p>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          className={primaryButton}
          onClick={() => {
            loadSeedIfEmpty(db).catch((e: unknown) =>
              setError(e instanceof Error ? e.message : String(e)),
            );
          }}
        >
          Voorbeeldreis laden
        </button>
      </div>
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-medium text-slate-500">Importeren uit back-up</p>
        <ImportPanel hasExistingTrip={false} />
      </div>
    </div>
  );
}
