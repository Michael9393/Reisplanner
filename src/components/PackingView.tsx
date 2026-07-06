import { useMemo, useState } from "react";
import { db } from "../db/db";
import type { TripData } from "../hooks/useTripData";
import type { PackingItemRecord, TripRecord } from "../domain/types";
import { addPackingItem, deletePackingItem, setPackingItemPacked } from "../db/repo";
import { SectionCard, inputClass, primaryButton } from "./shared";

export function PackingView({ data, trip }: { data: TripData; trip: TripRecord }) {
  const { packingItems } = data;
  const [newCategory, setNewCategory] = useState("");
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byCategory = new Map<string, PackingItemRecord[]>();
    for (const item of packingItems) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    return [...byCategory.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "nl"))
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.item.localeCompare(b.item, "nl")),
      }));
  }, [packingItems]);

  const packedCount = packingItems.filter((item) => item.packed).length;

  async function add() {
    const category = newCategory.trim();
    const item = newItem.trim();
    if (!category || !item) {
      setError("Vul zowel een categorie als een item in.");
      return;
    }
    setError(null);
    await addPackingItem(db, trip.id, { category, item, packed: false, notes: "" });
    setNewItem("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            {packedCount} van {packingItems.length} ingepakt
          </p>
          <p className="text-xs text-slate-400">Vink af tijdens het inpakken</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{
              width: `${packingItems.length === 0 ? 0 : Math.round((packedCount / packingItems.length) * 100)}%`,
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(({ category, items }) => (
          <SectionCard
            key={category}
            title={`${category} (${items.filter((i) => i.packed).length}/${items.length})`}
          >
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id} className="group flex items-start gap-2">
                  <label className="flex flex-1 cursor-pointer items-start gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={item.packed}
                      onChange={(e) => setPackingItemPacked(db, trip.id, item.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-emerald-600"
                    />
                    <span
                      className={`text-sm ${item.packed ? "text-slate-400 line-through" : "text-slate-700"}`}
                    >
                      {item.item}
                      {item.notes && (
                        <span className="block text-xs text-slate-400">{item.notes}</span>
                      )}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => deletePackingItem(db, trip.id, item.id)}
                    className="invisible rounded p-1 text-slate-300 hover:text-red-500 group-hover:visible"
                    title="Verwijderen"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="Item toevoegen">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="pack-category">
              Categorie
            </label>
            <input
              id="pack-category"
              className={inputClass}
              list="packing-categories"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="bijv. Kleding"
            />
            <datalist id="packing-categories">
              {groups.map(({ category }) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="pack-item">
              Item
            </label>
            <input
              id="pack-item"
              className={inputClass}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="bijv. Zonnebril"
            />
          </div>
          <button type="button" className={primaryButton} onClick={add}>
            Toevoegen
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </SectionCard>
    </div>
  );
}
