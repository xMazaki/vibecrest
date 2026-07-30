export type Status = "working" | "attention" | "question" | "waiting" | "idle";

export interface DiffRow {
  /** " " inchangé, "+" ajouté, "-" retiré, "~" plage repliée. */
  sign: " " | "+" | "-" | "~";
  text: string;
}

export interface Preview {
  kind: "diff" | "multi" | "command" | "text" | "markdown" | "note" | "plain";
  title?: string;
  body?: string;
  rows?: DiffRow[];
  parts?: Preview[];
  count?: number;
  added?: number;
  removed?: number;
  clipped?: number;
  shell?: string;
  language?: string;
}

export interface Pending {
  requestId: string;
  toolName: string;
  summary: string;
  /** Instant de la demande, pour faire monter l'insistance visuelle. */
  since: number;
  preview: Preview | null;
}

export interface UsageBucket {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  turns: number;
}

export interface CodexUsage {
  available: boolean;
  reason?: string;
  total?: UsageBucket;
  window?: UsageBucket;
  files?: number;
}

export interface UsageReport {
  windowMs: number;
  window: UsageBucket;
  today: UsageBucket;
  total: UsageBucket;
  codex: CodexUsage;
  byModel: (UsageBucket & { model: string })[];
  windowResetsAt: number | null;
  lastActivity: number | null;
  files: number;
  truncated: boolean;
  computedAt: number;
}

export interface CodexStatus {
  present: boolean;
  installed: boolean;
  error: string | null;
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionBlock {
  header: string;
  question: string;
  /** Plusieurs réponses acceptées pour cette question. */
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface PendingQuestion {
  /** Absent si le mode auto a laissé la question filer vers le terminal. */
  requestId: string | null;
  blocks: QuestionBlock[] | null;
}

export interface Answer {
  question: string;
  answer: string;
}

export interface ShortcutStatus {
  accelerator: string | null;
  error: string | null;
}

export interface ActivityEntry {
  /** Identifiant stable, nécessaire pour animer arrivées et départs. */
  id: string;
  at: number;
  kind: "session" | "prompt" | "tool" | "notice" | "stop" | "subagent";
  tool?: string;
  detail?: string;
  text?: string;
  state?: "running" | "pending" | "done";
  tookMs?: number;
  outcome?: string;
}

export interface HostInfo {
  kind: string;
  label: string;
  exe: string | null;
}

export interface Session {
  id: string;
  agent: string;
  cwd: string;
  label: string;
  host: HostInfo;
  allowRules: string[];
  status: Status;
  tool: string | null;
  prompt: string | null;
  message: string | null;
  pending: Pending | null;
  question: PendingQuestion | null;
  activity: ActivityEntry[];
  toolCount: number;
  subagents: number;
  ppid: number | null;
  startedAt: number;
  turnStartedAt: number;
  updatedAt: number;
}

export type Edge = "top" | "bottom" | "left" | "right" | "free";

export interface Placement {
  edge: Edge;
  along: number;
  x: number;
  y: number;
  displayId: number | null;
}

/** Géométrie calculée par le processus principal pour l'ancrage courant. */
export interface Layout {
  bounds: { x: number; y: number; width: number; height: number };
  /** Position de l'ancre dans la fenêtre conteneur, en pixels CSS. */
  anchor: { x: number; y: number };
  edge: Edge;
  placement: Placement;
}

export interface Config {
  gatedTools: string[];
  autoMode: boolean;
  muted: boolean;
  sounds: boolean;
  minimizeWhenIdle: boolean;
  onboarded: boolean;
  summonShortcut: string;
  usageLimit: number;
  dismissAfterMs: number;
  decisionTimeoutMs: number;
  placement: Placement;
}

export interface HooksStatus {
  installed: boolean;
  partial: boolean;
  events: string[];
  scriptPresent: boolean;
  error: string | null;
}

export interface CrestState {
  sessions: Session[];
  config: Config;
  hooks: HooksStatus;
  editors: EditorsStatus;
  codex: CodexStatus;
  usage: UsageReport | null;
  shortcut: ShortcutStatus;
  /** Lu dans le registre Windows, pas dans notre configuration. */
  autostart: boolean;
  layout: Layout | null;
  placementLabel: string;
  pipeReady: boolean;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
  /** Nom du processus dont la fenêtre a été activée. */
  window?: string;
  /** Chaîne des processus parents parcourue, utile au diagnostic. */
  chain?: string;
  /** Vrai quand l'extension a pu viser le panneau de terminal exact. */
  precise?: boolean;
}

export interface EditorInfo {
  kind: string;
  label: string;
  installed: boolean;
}

export interface EditorsStatus {
  editors: EditorInfo[];
  anyInstalled: boolean;
}

export interface EditorActionResult {
  ok: boolean;
  results: { editor: string; ok: boolean; error?: string }[];
}

export interface CrestBridge {
  snapshot(): Promise<CrestState>;
  onState(handler: (state: CrestState) => void): () => void;
  decide(requestId: string, decision: "allow" | "deny", reason?: string): Promise<boolean>;
  always(requestId: string, sessionId: string, toolName: string): Promise<boolean>;
  answer(requestId: string, answers: Answer[]): Promise<boolean>;
  skipQuestion(requestId: string): Promise<boolean>;
  clearRules(sessionId: string): Promise<boolean>;
  jump(sessionId: string): Promise<ActionResult>;
  dismiss(sessionId: string): Promise<boolean>;
  setConfig(patch: Partial<Config>): Promise<Config>;
  installHooks(): Promise<{ ok: boolean; error?: string; scriptPath?: string; settingsPath?: string }>;
  uninstallHooks(): Promise<{ ok: boolean; error?: string }>;
  installEditorExtension(): Promise<EditorActionResult>;
  uninstallEditorExtension(): Promise<EditorActionResult>;
  setAutostart(enabled: boolean): Promise<{ ok: boolean; enabled: boolean; reason?: string }>;
  installCodex(): Promise<{ ok: boolean; error?: string; configPath?: string }>;
  uninstallCodex(): Promise<{ ok: boolean; removed?: boolean }>;
  refreshUsage(): Promise<UsageReport | null>;
  openUsage(): Promise<boolean>;
  closeUsage(): void;
  contextMenu(): void;
  revealConfig(): Promise<ActionResult>;
  openSettings(): Promise<boolean>;
  quit(): Promise<void>;
  setInteractive(value: boolean): void;
  surface(): void;

  onLayout(handler: (layout: Layout) => void): () => void;
  dragStart(): void;
  dragEnd(): void;
  releaseFocus(): void;
  onSummon(handler: () => void): () => void;
  resetPlacement(): Promise<Placement>;
}

declare global {
  interface Window {
    crest: CrestBridge;
  }
}
