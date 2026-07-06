import { useMemo, useState } from "react";
import { db } from "../db/db";
import type { TripData } from "../hooks/useTripData";
import { useUIStore } from "../state/ui";
import type { BudgetItemRecord, TripRecord } from "../domain/types";
import {
  GLOBAL_BUCKET,
  totalsByCategory,
  totalsByCountry,
  totalsBySegment,
  totalsOverall,
  type BudgetContext,
  type Totals,
} from "../domain/budget";
import { addDays, formatDayMonthNL } from "../domain/dates";
import { formatEuro } from "../domain/format";
import {
  addBudgetItem,
  deleteBudgetItem,
  updateBudgetItem,
  type BudgetItemInput,
} from "../db/repo";
import {
  Modal,
  SectionCard,
  dangerButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "./shared";

export function BudgetView({ data, trip }: { data: TripData; trip: TripRecord }) {
  const { editingBudgetItemId, setEditingBudgetItemId } = useUIStore();

  const ctx: BudgetContext = useMemo(
    () => ({
      categories: data.budgetCategories,
      items: data.budgetItems,
      destinations: data.destinations,
      segments: data.segments,
      transport: data.transport,
    }),
    [data],
  );

  const overall = totalsOverall(ctx.items);
  const byCategory = totalsByCategory(ctx);
  const byCountry = totalsByCountry(ctx);
  const bySegment = totalsBySegment(ctx);

  const categories = useMemo(
    () => [...ctx.categories].sort((a, b) => a.label.localeCompare(b.label, "nl")),
    [ctx.categories],
  );

  // Landen in reisvolgorde (volgorde van eerste segment), "Algemeen" achteraan.
  const countryRows = useMemo(() => {
    const order: string[] = [];
    for (const segment of ctx.segments) {
      const country = ctx.destinations.find((d) => d.id === segment.destinationId)?.country;
      if (country && !order.includes(country)) order.push(country);
    }
    for (const country of [...byCountry.keys()].sort((a, b) => a.localeCompare(b, "nl"))) {
      if (country !== GLOBAL_BUCKET && !order.includes(country)) order.push(country);
    }
    if (byCountry.has(GLOBAL_BUCKET)) order.push(GLOBAL_BUCKET);
    return order
      .filter((country) => byCountry.has(country))
      .map((country) => ({ label: country, totals: byCountry.get(country)! }));
  }, [ctx, byCountry]);

  const segmentRows = useMemo(() => {
    return ctx.segments
      .filter((segment) => bySegment.has(segment.id))
      .map((segment) => {
        const dest = ctx.destinations.find((d) => d.id === segment.destinationId);
        return {
          label: `${dest?.name ?? segment.destinationId} (${formatDayMonthNL(segment.startDate)} – ${formatDayMonthNL(addDays(segment.startDate, segment.nights))})`,
          totals: bySegment.get(segment.id)!,
        };
      });
  }, [ctx, bySegment]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Gepland totaal" value={formatEuro(overall.planned)} />
        <SummaryTile
          label={`Werkelijk (${overall.actualCount} van ${overall.itemCount} posten ingevuld)`}
          value={formatEuro(overall.actual)}
        />
        <SummaryTile
          label="Verschil gepland − werkelijk"
          value={formatEuro(overall.planned - overall.actual)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Per categorie">
          <TotalsTable
            rows={categories.map((category) => ({
              label: category.label,
              totals: byCategory.get(category.id) ?? emptyTotals(),
            }))}
          />
        </SectionCard>
        <SectionCard title="Per land">
          <TotalsTable rows={countryRows} />
        </SectionCard>
      </div>

      {segmentRows.length > 0 && (
        <SectionCard title="Per segment (posten op segmentniveau)">
          <TotalsTable rows={segmentRows} />
        </SectionCard>
      )}

      <SectionCard
        title="Budgetposten"
        action={
          <button
            type="button"
            className={primaryButton}
            onClick={() => setEditingBudgetItemId("new")}
          >
            + Post toevoegen
          </button>
        }
      >
        <div className="space-y-4">
          {categories.map((category) => {
            const items = ctx.items
              .filter((item) => item.categoryId === category.id)
              .sort((a, b) => a.label.localeCompare(b.label, "nl"));
            if (items.length === 0) return null;
            return (
              <div key={category.id}>
                <h3 className="mb-1 text-sm font-semibold text-slate-600">{category.label}</h3>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {items.map((item) => (
                    <BudgetItemRow
                      key={item.id}
                      item={item}
                      ctx={ctx}
                      trip={trip}
                      onEdit={() => setEditingBudgetItemId(item.id)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {editingBudgetItemId !== null && (
        <BudgetItemEditor
          key={editingBudgetItemId}
          trip={trip}
          ctx={ctx}
          item={
            editingBudgetItemId === "new"
              ? null
              : (ctx.items.find((i) => i.id === editingBudgetItemId) ?? null)
          }
          onClose={() => setEditingBudgetItemId(null)}
        />
      )}
    </div>
  );
}

function emptyTotals(): Totals {
  return { planned: 0, actual: 0, actualCount: 0, itemCount: 0 };
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function TotalsTable({ rows }: { rows: { label: string; totals: Totals }[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-400">
          <th className="pb-1 font-medium"> </th>
          <th className="pb-1 text-right font-medium">Gepland</th>
          <th className="pb-1 text-right font-medium">Werkelijk</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-slate-100">
            <td className="py-1.5 text-slate-700">{row.label}</td>
            <td className="py-1.5 text-right font-medium text-slate-800">
              {formatEuro(row.totals.planned)}
            </td>
            <td className="py-1.5 text-right text-slate-500">
              {row.totals.actualCount > 0 ? formatEuro(row.totals.actual) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Omschrijving van waar een post aan hangt (bestemming, segment, transport of globaal). */
function linkDescription(item: BudgetItemRecord, ctx: BudgetContext): string {
  if (item.destinationId) {
    const dest = ctx.destinations.find((d) => d.id === item.destinationId);
    return dest ? `📍 ${dest.name}` : "📍 onbekende bestemming";
  }
  if (item.itinerarySegmentId) {
    const segment = ctx.segments.find((s) => s.id === item.itinerarySegmentId);
    if (!segment) return "🗓 onbekend segment";
    const dest = ctx.destinations.find((d) => d.id === segment.destinationId);
    return `🗓 ${dest?.name ?? "?"} ${formatDayMonthNL(segment.startDate)}`;
  }
  if (item.transportId) {
    const leg = ctx.transport.find((t) => t.id === item.transportId);
    return leg ? `🚏 ${leg.label}` : "🚏 onbekend transport";
  }
  return "🌐 globaal";
}

function BudgetItemRow({
  item,
  ctx,
  trip,
  onEdit,
}: {
  item: BudgetItemRecord;
  ctx: BudgetContext;
  trip: TripRecord;
  onEdit: () => void;
}) {
  const [draft, setDraft] = useState<string>(item.amountActual?.toString() ?? "");

  async function commitActual() {
    const trimmed = draft.trim();
    const value = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setDraft(item.amountActual?.toString() ?? "");
      return;
    }
    if (value !== item.amountActual) {
      await updateBudgetItem(db, trip.id, item.id, { amountActual: value });
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-800">{item.label}</p>
        <p className="text-xs text-slate-400">
          {linkDescription(item, ctx)}
          {item.notes && ` · ${item.notes}`}
        </p>
      </div>
      <div className="text-right text-sm font-medium text-slate-700">
        {formatEuro(item.amountPlanned)}
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-400">
        werkelijk
        <input
          type="text"
          inputMode="decimal"
          placeholder="—"
          className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-sm text-slate-700 focus:border-emerald-500 focus:outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitActual}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Bewerken"
      >
        ✎
      </button>
    </li>
  );
}

type LinkKind = "globaal" | "bestemming" | "segment" | "transport";

function linkKindOf(item: BudgetItemRecord | null): LinkKind {
  if (item?.destinationId) return "bestemming";
  if (item?.itinerarySegmentId) return "segment";
  if (item?.transportId) return "transport";
  return "globaal";
}

function BudgetItemEditor({
  trip,
  ctx,
  item,
  onClose,
}: {
  trip: TripRecord;
  ctx: BudgetContext;
  item: BudgetItemRecord | null;
  onClose: () => void;
}) {
  const categories = [...ctx.categories].sort((a, b) => a.label.localeCompare(b.label, "nl"));
  const [label, setLabel] = useState(item?.label ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [planned, setPlanned] = useState(item?.amountPlanned?.toString() ?? "");
  const [actual, setActual] = useState(item?.amountActual?.toString() ?? "");
  const [linkKind, setLinkKind] = useState<LinkKind>(linkKindOf(item));
  const [destinationId, setDestinationId] = useState(item?.destinationId ?? "");
  const [segmentId, setSegmentId] = useState(item?.itinerarySegmentId ?? "");
  const [transportId, setTransportId] = useState(item?.transportId ?? "");
  const [originalAmount, setOriginalAmount] = useState(item?.originalAmount?.toString() ?? "");
  const [originalCurrency, setOriginalCurrency] = useState(item?.originalCurrency ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function parseAmount(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const value = Number(trimmed.replace(",", "."));
    return Number.isFinite(value) && value >= 0 ? value : NaN;
  }

  async function save() {
    const plannedValue = parseAmount(planned) ?? 0;
    const actualValue = parseAmount(actual);
    const originalValue = parseAmount(originalAmount);
    if (label.trim() === "") return setError("Geef de post een omschrijving.");
    if (!categoryId) return setError("Kies een categorie.");
    if (Number.isNaN(plannedValue)) return setError("Gepland bedrag is ongeldig.");
    if (Number.isNaN(actualValue)) return setError("Werkelijk bedrag is ongeldig.");
    if (Number.isNaN(originalValue)) return setError("Origineel bedrag is ongeldig.");
    if (linkKind === "bestemming" && !destinationId) return setError("Kies een bestemming.");
    if (linkKind === "segment" && !segmentId) return setError("Kies een segment.");
    if (linkKind === "transport" && !transportId) return setError("Kies een transport.");

    const input: BudgetItemInput = {
      categoryId,
      label: label.trim(),
      amountPlanned: plannedValue,
      amountActual: actualValue,
      destinationId: linkKind === "bestemming" ? destinationId : null,
      itinerarySegmentId: linkKind === "segment" ? segmentId : null,
      transportId: linkKind === "transport" ? transportId : null,
      originalAmount: originalValue,
      originalCurrency:
        originalValue !== null && originalCurrency.trim() !== ""
          ? originalCurrency.trim().toUpperCase()
          : null,
      notes,
    };
    try {
      if (item) {
        await updateBudgetItem(db, trip.id, item.id, input);
      } else {
        await addBudgetItem(db, trip.id, input);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    if (!item) return;
    if (!window.confirm(`Budgetpost "${item.label}" verwijderen?`)) return;
    await deleteBudgetItem(db, trip.id, item.id);
    onClose();
  }

  return (
    <Modal title={item ? "Budgetpost bewerken" : "Nieuwe budgetpost"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelClass} htmlFor="budget-label">
            Omschrijving
          </label>
          <input
            id="budget-label"
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass} htmlFor="budget-category">
              Categorie
            </label>
            <select
              id="budget-category"
              className={inputClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="budget-planned">
              Gepland (€)
            </label>
            <input
              id="budget-planned"
              className={inputClass}
              inputMode="decimal"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="budget-actual">
              Werkelijk (€)
            </label>
            <input
              id="budget-actual"
              className={inputClass}
              inputMode="decimal"
              placeholder="leeg = nog niet"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="budget-link">
            Koppeling
          </label>
          <div className="grid grid-cols-2 gap-3">
            <select
              id="budget-link"
              className={inputClass}
              value={linkKind}
              onChange={(e) => setLinkKind(e.target.value as LinkKind)}
            >
              <option value="globaal">Globaal (hele reis)</option>
              <option value="bestemming">Bestemming</option>
              <option value="segment">Segment</option>
              <option value="transport">Transport</option>
            </select>
            {linkKind === "bestemming" && (
              <select
                className={inputClass}
                value={destinationId}
                onChange={(e) => setDestinationId(e.target.value)}
                aria-label="Bestemming"
              >
                <option value="">— kies —</option>
                {[...ctx.destinations]
                  .sort((a, b) => a.name.localeCompare(b.name, "nl"))
                  .map((dest) => (
                    <option key={dest.id} value={dest.id}>
                      {dest.name} ({dest.country})
                    </option>
                  ))}
              </select>
            )}
            {linkKind === "segment" && (
              <select
                className={inputClass}
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                aria-label="Segment"
              >
                <option value="">— kies —</option>
                {ctx.segments.map((segment) => {
                  const dest = ctx.destinations.find((d) => d.id === segment.destinationId);
                  return (
                    <option key={segment.id} value={segment.id}>
                      {dest?.name ?? segment.destinationId} · {formatDayMonthNL(segment.startDate)}
                    </option>
                  );
                })}
              </select>
            )}
            {linkKind === "transport" && (
              <select
                className={inputClass}
                value={transportId}
                onChange={(e) => setTransportId(e.target.value)}
                aria-label="Transport"
              >
                <option value="">— kies —</option>
                {ctx.transport.map((leg) => (
                  <option key={leg.id} value={leg.id}>
                    {leg.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Globale posten (visa, verzekering, gear, buffer) tellen mee in het totaal zonder aan
            een bestemming te hangen.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="budget-original">
              Origineel bedrag (optioneel)
            </label>
            <input
              id="budget-original"
              className={inputClass}
              inputMode="decimal"
              value={originalAmount}
              onChange={(e) => setOriginalAmount(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="budget-currency">
              Originele valuta
            </label>
            <input
              id="budget-currency"
              className={inputClass}
              placeholder="bijv. JPY"
              maxLength={3}
              value={originalCurrency}
              onChange={(e) => setOriginalCurrency(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="budget-notes">
            Notities
          </label>
          <textarea
            id="budget-notes"
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between pt-1">
          {item ? (
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
