"use strict";

const { contextBridge } = require("electron");

/**
 * Doublure du pont exposé au rendu, pour le banc de rendu.
 *
 * Elle permet de charger les vrais composants avec un état choisi, plutôt que
 * d'en recopier le balisage dans le banc. Ce qui est jugé à l'écran est donc
 * bien ce qui s'exécutera.
 */

const bucket = (input, output, cacheWrite, cacheRead, turns) => ({
  input,
  output,
  cacheWrite,
  cacheRead,
  turns,
});

const STATE = {
  sessions: [],
  config: {
    gatedTools: ["Bash", "PowerShell"],
    autoMode: false,
    muted: false,
    sounds: true,
    minimizeWhenIdle: false,
    onboarded: true,
    summonShortcut: "Alt+G",
    usageLimit: 2_000_000,
    dismissAfterMs: 0,
    decisionTimeoutMs: 240000,
    placement: { edge: "top", along: 0.5, x: 0.5, y: 0.15, displayId: null },
  },
  hooks: { installed: true, partial: false, events: [], scriptPresent: true, error: null },
  editors: { editors: [], anyInstalled: false },
  codex: { present: true, installed: true, error: null },
  shortcut: { accelerator: "Alt+G", error: null },
  autostart: false,
  layout: null,
  placementLabel: "Accroché en haut",
  pipeReady: true,
  usage: {
    windowMs: 5 * 60 * 60 * 1000,
    window: bucket(1016, 891505, 1087288, 223485691, 508),
    today: bucket(2400, 1204300, 1509000, 402000000, 812),
    total: bucket(18400, 5904300, 8109000, 1402000000, 4120),
    byModel: [
      { model: "claude-opus-5", ...bucket(1016, 891505, 1087288, 223485691, 508) },
      { model: "claude-haiku-4-5", ...bucket(200, 128400, 90200, 12400000, 96) },
    ],
    windowResetsAt: Date.now() + 96 * 60 * 1000,
    lastActivity: Date.now(),
    files: 2,
    truncated: false,
    computedAt: Date.now(),
    codex: {
      available: false,
      reason:
        "Codex enregistre son historique dans une base SQLite que Vibe Crest ne lit pas. Sa consommation n'est donc pas mesurable ici.",
    },
  },
};

const noop = () => {};

contextBridge.exposeInMainWorld("crest", {
  snapshot: async () => STATE,
  onState: () => noop,
  onLayout: () => noop,
  onSummon: () => noop,
  refreshUsage: async () => STATE.usage,
  closeUsage: noop,
  openUsage: async () => true,
  setInteractive: noop,
  surface: noop,
  dragStart: noop,
  dragEnd: noop,
  releaseFocus: noop,
  contextMenu: noop,
  setConfig: async () => STATE.config,
});
