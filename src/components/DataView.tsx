import { useRef, useState } from "react";
import { db } from "../db/db";
import type { TripData } from "../hooks/useTripData";
import type { TripRecord } from "../domain/types";
import { MAX_IMPORT_BYTES, parseTripDocumentFromText } from "../domain/schema";
import { buildExportFile, importDocument, markExported, wipeDatabase } from "../db/repo";
import { getSeedDocument } from "../db/seed";
import { downloadTextFile } from "../ui/download";
import { formatTimestampNL } from "../domain/format";
import { SectionCard, dangerButton, primaryButton, secondaryButton } from "./shared";

/** Exportactie + statusmelding, gedeeld tussen header en data-tab. */
export function useExportAction(trip: TripRecord | null) {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function run() {
    if (!trip) return;
    try {
      // Eerst de download echt aanbieden, pas daarna het exportmoment
      // registreren — een mislukte export mag nooit als back-up gelden.
      const { json, filename } = await buildExportFile(db, trip.id);
      downloadTextFile(filename, json);
      await markExported(db, trip.id);
      setIsError(false);
      setMessage(`Export gedownload als "${filename}". Bewaar het bestand buiten de browser, bij voorkeur in Git.`);
    } catch (error: unknown) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return { run, message, isError };
}

/**
 * Bestandskeuze + validatie + transactionele import. Ook bruikbaar zonder
 * actieve reis (lege database), bijvoorbeeld na "alles wissen".
 */
export function ImportPanel({ hasExistingTrip }: { hasExistingTrip: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleImportFile(file: File) {
    setBusy(true);
    setImportErrors([]);
    setImportSuccess(null);
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        setImportErrors([
          `Het bestand is ${(file.size / 1024 / 1024).toFixed(1)} MB; imports zijn begrensd op ${MAX_IMPORT_BYTES / 1024 / 1024} MB. Een reisdocument is normaal minder dan 1 MB — dit lijkt geen exportbestand.`,
        ]);
        return;
      }
      const text = await file.text();
      const result = parseTripDocumentFromText(text);
      if (!result.ok) {
        setImportErrors(result.errors);
        return;
      }
      if (hasExistingTrip) {
        const confirmed = window.confirm(
          `Dit vervangt de huidige reis volledig door "${result.doc.meta.title}" uit het gekozen bestand. Doorgaan?`,
        );
        if (!confirmed) return;
      }
      await importDocument(db, result.doc);
      setImportSuccess(
        `"${result.doc.meta.title}" is geïmporteerd` +
          (result.migratedFrom !== null
            ? ` (gemigreerd van schemaversie ${result.migratedFrom}).`
            : "."),
      );
    } catch (error: unknown) {
      setImportErrors([
        "Importeren is mislukt; de bestaande reis is niet gewijzigd.",
        error instanceof Error ? error.message : String(error),
      ]);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
        }}
        className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700"
      />
      {importSuccess && <p className="mt-2 text-sm text-emerald-700">{importSuccess}</p>}
      {importErrors.length > 0 && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">Import geweigerd:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {importErrors.slice(0, 12).map((error) => (
              <li key={error}>{error}</li>
            ))}
            {importErrors.length > 12 && <li>… en {importErrors.length - 12} andere fouten.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DataView({ data, trip }: { data: TripData; trip: TripRecord }) {
  const exportAction = useExportAction(trip);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  const unsavedChanges =
    trip.lastExportedAt === null || trip.updatedAt > trip.lastExportedAt;

  async function reloadSeed() {
    if (!window.confirm("De huidige reis vervangen door de meegeleverde voorbeeldreis?")) return;
    setMaintenanceMessage(null);
    setMaintenanceError(null);
    try {
      await importDocument(db, getSeedDocument());
      setMaintenanceMessage("Voorbeeldreis opnieuw geladen.");
    } catch (error: unknown) {
      setMaintenanceError(
        `Voorbeeldreis laden is mislukt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function wipe() {
    const warning = unsavedChanges
      ? trip.lastExportedAt === null
        ? "LET OP: deze reis is nog NOOIT geëxporteerd. Zonder exportbestand is de planning definitief weg.\n\n"
        : "LET OP: er zijn wijzigingen die nog in geen enkel exportbestand staan; die gaan verloren.\n\n"
      : "";
    if (!window.confirm(`${warning}Alle lokale reisdata wissen?`)) return;
    setMaintenanceMessage(null);
    setMaintenanceError(null);
    try {
      await wipeDatabase(db);
    } catch (error: unknown) {
      setMaintenanceError(
        `Wissen is mislukt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Back-upstatus">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-400">Laatst lokaal opgeslagen</dt>
            <dd className="font-medium text-slate-700">{formatTimestampNL(trip.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Laatst geëxporteerd</dt>
            <dd className="font-medium text-slate-700">
              {trip.lastExportedAt ? formatTimestampNL(trip.lastExportedAt) : "nog nooit"}
            </dd>
          </div>
        </dl>
        {unsavedChanges && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Er zijn wijzigingen die nog niet in een exportbestand staan. Browseropslag is geen
            back-up: exporteer na belangrijke wijzigingen.
          </p>
        )}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Exporteren (back-up)">
          <p className="mb-3 text-sm text-slate-500">
            Slaat de volledige reis op als één JSON-bestand: planning, bestemmingen, transport,
            budget en paklijst. Bewaar het bestand buiten de browser, bij voorkeur in een
            Git-repository.
          </p>
          <button type="button" className={primaryButton} onClick={exportAction.run}>
            Reis exporteren als JSON
          </button>
          {exportAction.message && (
            <p
              className={`mt-2 text-sm ${exportAction.isError ? "text-red-600" : "text-emerald-700"}`}
            >
              {exportAction.message}
            </p>
          )}
        </SectionCard>

        <SectionCard title="Importeren">
          <p className="mb-3 text-sm text-slate-500">
            Laadt een eerder geëxporteerd bestand en vervangt de huidige reis volledig. Het
            bestand wordt eerst gevalideerd; bij fouten blijft de bestaande reis onaangetast.
          </p>
          <ImportPanel hasExistingTrip />
        </SectionCard>
      </div>

      <SectionCard title="Aanbevolen back-upworkflow">
        <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600">
          <li>Werk de planning bij in de app; alles wordt automatisch lokaal opgeslagen.</li>
          <li>Exporteer na belangrijke wijzigingen naar JSON.</li>
          <li>Commit het exportbestand in een Git-repository (history + extra kopie).</li>
          <li>Bij dataverlies of een nieuwe laptop: importeer hetzelfde bestand.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-400">
          Deze app werkt volledig lokaal in de browser (IndexedDB). Er is geen server en geen
          synchronisatie — het exportbestand is de enige echte back-up.
        </p>
      </SectionCard>

      <SectionCard title="Onderhoud">
        <div className="flex flex-wrap gap-3">
          <button type="button" className={secondaryButton} onClick={reloadSeed}>
            Voorbeeldreis opnieuw laden
          </button>
          <button type="button" className={dangerButton} onClick={wipe}>
            Alle lokale data wissen
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          “Alle lokale data wissen” + opnieuw importeren is de test dat je back-up compleet is.
        </p>
        {maintenanceMessage && (
          <p className="mt-2 text-sm text-emerald-700">{maintenanceMessage}</p>
        )}
        {maintenanceError && <p className="mt-2 text-sm text-red-600">{maintenanceError}</p>}
      </SectionCard>

      <p className="text-xs text-slate-400">
        {data.destinations.length} bestemmingen · {data.segments.length} segmenten ·{" "}
        {data.transport.length} transporten · {data.budgetItems.length} budgetposten ·{" "}
        {data.packingItems.length} paklijstitems
      </p>
    </div>
  );
}
