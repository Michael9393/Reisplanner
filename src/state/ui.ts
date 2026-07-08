/**
 * Tijdelijke UI-state (Zustand): actieve tab en open editors. Reisdata zelf
 * leeft in Dexie en bereikt de UI via useLiveQuery — nooit via deze store.
 */
import { create } from "zustand";

export type Tab =
  | "planning"
  | "kaart"
  | "bestemmingen"
  | "kladblok"
  | "budget"
  | "paklijst"
  | "data";

export const TABS: { id: Tab; label: string }[] = [
  { id: "planning", label: "Planning" },
  { id: "kaart", label: "Kaart" },
  { id: "bestemmingen", label: "Bestemmingen" },
  { id: "kladblok", label: "Kladblok" },
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
  editingDestinationId: EditorTarget;
  setEditingDestinationId: (id: EditorTarget) => void;
  editingTransportId: EditorTarget;
  setEditingTransportId: (id: EditorTarget) => void;
  editingIdeaId: EditorTarget;
  setEditingIdeaId: (id: EditorTarget) => void;
  /** Idee dat via de bestemmingseditor gepromoveerd wordt (null = geen). */
  promotingIdeaId: string | null;
  setPromotingIdeaId: (id: string | null) => void;
};

export const useUIStore = create<UIState>((set) => ({
  tab: "planning",
  setTab: (tab) => set({ tab }),
  editingSegmentId: null,
  setEditingSegmentId: (editingSegmentId) => set({ editingSegmentId }),
  editingBudgetItemId: null,
  setEditingBudgetItemId: (editingBudgetItemId) => set({ editingBudgetItemId }),
  editingDestinationId: null,
  setEditingDestinationId: (editingDestinationId) => set({ editingDestinationId }),
  editingTransportId: null,
  setEditingTransportId: (editingTransportId) => set({ editingTransportId }),
  editingIdeaId: null,
  setEditingIdeaId: (editingIdeaId) => set({ editingIdeaId }),
  promotingIdeaId: null,
  setPromotingIdeaId: (promotingIdeaId) => set({ promotingIdeaId }),
}));
