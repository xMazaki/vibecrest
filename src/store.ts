import { create } from "zustand";
import type {
  CodexStatus,
  Config,
  CrestState,
  EditorsStatus,
  HooksStatus,
  Layout,
  Session,
} from "./types";

const EMPTY_CONFIG: Config = {
  gatedTools: ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit", "WebFetch"],
  autoMode: false,
  muted: false,
  sounds: true,
  minimizeWhenIdle: false,
  onboarded: true,
  summonShortcut: "Alt+G",
  usageLimit: 0,
  dismissAfterMs: 0,
  decisionTimeoutMs: 240000,
  placement: { edge: "top", along: 0.5, x: 0.5, y: 0.15, displayId: null },
};

const EMPTY_HOOKS: HooksStatus = {
  installed: false,
  partial: false,
  events: [],
  scriptPresent: false,
  error: null,
};

const EMPTY_EDITORS: EditorsStatus = { editors: [], anyInstalled: false };
const EMPTY_CODEX: CodexStatus = { present: false, installed: false, error: null };

interface Store extends CrestState {
  hover: boolean;
  dragging: boolean;
  /** Session dont le détail est affiché, null pour suivre la priorité. */
  selectedId: string | null;
  setHover(hover: boolean): void;
  setDragging(dragging: boolean): void;
  setLayout(layout: Layout): void;
  select(id: string | null): void;
  ingest(state: CrestState): void;
}

export const useCrest = create<Store>((set) => ({
  sessions: [],
  config: EMPTY_CONFIG,
  hooks: EMPTY_HOOKS,
  editors: EMPTY_EDITORS,
  codex: EMPTY_CODEX,
  usage: null,
  shortcut: { accelerator: null, error: null },
  autostart: false,
  layout: null,
  placementLabel: "",
  pipeReady: false,
  hover: false,
  dragging: false,
  selectedId: null,
  setHover: (hover) => set({ hover }),
  setDragging: (dragging) => set({ dragging }),
  setLayout: (layout) => set({ layout }),
  select: (selectedId) => set({ selectedId }),
  ingest: (state) =>
    set((prev) => {
      const sessions = state.sessions ?? [];
      // Une sélection qui pointe vers une session disparue retombe sur la priorité.
      const stillThere = prev.selectedId && sessions.some((s) => s.id === prev.selectedId);
      return {
        sessions,
        config: { ...EMPTY_CONFIG, ...(state.config ?? {}) },
        hooks: { ...EMPTY_HOOKS, ...(state.hooks ?? {}) },
        editors: { ...EMPTY_EDITORS, ...(state.editors ?? {}) },
        codex: { ...EMPTY_CODEX, ...(state.codex ?? {}) },
        usage: state.usage ?? prev.usage,
        shortcut: state.shortcut ?? prev.shortcut,
        autostart: Boolean(state.autostart),
        // La géométrie arrive par son propre canal, plus fréquent que l'état.
        layout: state.layout ?? prev.layout,
        placementLabel: state.placementLabel ?? prev.placementLabel,
        pipeReady: Boolean(state.pipeReady),
        selectedId: stillThere ? prev.selectedId : null,
      };
    }),
}));

/** Session mise en avant : la sélection explicite, sinon la plus prioritaire. */
export function focusedSession(sessions: Session[], selectedId: string | null): Session | null {
  if (selectedId) {
    const found = sessions.find((s) => s.id === selectedId);
    if (found) return found;
  }
  return sessions[0] ?? null;
}

export function needsUser(sessions: Session[]): boolean {
  return sessions.some(
    (s) => s.status === "attention" || s.status === "question" || s.status === "waiting"
  );
}

/** Nombre de décisions d'autorisation en attente, toutes sessions confondues. */
export function pendingCount(sessions: Session[]): number {
  return sessions.filter((s) => s.pending).length;
}
