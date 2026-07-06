/**
 * Tijdelijke UI-state (Zustand): actieve tab en open editors. Reisdata zelf
 * leeft in Dexie en bereikt de UI via useLiveQuery — nooit via deze store.
 */
import { create } from "zustand";

export type Tab = "planning" | "kaart" | "budget" | "paklijst" | "data";

export const TABS: { id: Tab; label: string }[] = [
  { id: "planning", label: "Planning" },
  { id: "kaart", label: "Kaart" },
  { id: "budget", label: "Budget" },
  { id: "paklijst", label: "Paklijst" },
  { id: "data", label: "Back-up & data" },
];

/** null = editor dicht, "new" = nieuw record, anders het record-id. */
export type EditorTarget = string | "new" | null;

type UIState = {
  tab: Tab;
  setTab: (tab: Tab) => void;
  editingSegmentId: EditorTarget;
  setEditingSegmentId: (id: EditorTarget) => void;
  editingBudgetItemId: EditorTarget;
  setEditingBudgetItemId: (id: EditorTarget) => void;
};

export const useUIStore = create<UIState>((set) => ({
  tab: "planning",
  setTab: (tab) => set({ tab }),
  editingSegmentId: null,
  setEditingSegmentId: (editingSegmentId) => set({ editingSegmentId }),
  editingBudgetItemId: null,
  setEditingBudgetItemId: (editingBudgetItemId) => set({ editingBudgetItemId }),
}));
