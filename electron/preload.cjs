"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * Surface exposée au rendu. Volontairement étroite : aucune primitive Node,
 * aucun accès au système de fichiers, uniquement des verbes métier.
 */
contextBridge.exposeInMainWorld("crest", {
  snapshot: () => ipcRenderer.invoke("crest:snapshot"),

  onState: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on("crest:state", listener);
    return () => ipcRenderer.removeListener("crest:state", listener);
  },

  decide: (requestId, decision, reason) =>
    ipcRenderer.invoke("crest:decide", { requestId, decision, reason }),
  always: (requestId, sessionId, toolName) =>
    ipcRenderer.invoke("crest:always", { requestId, sessionId, toolName }),
  answer: (requestId, answers) => ipcRenderer.invoke("crest:answer", { requestId, answers }),
  skipQuestion: (requestId) => ipcRenderer.invoke("crest:skip-question", { requestId }),
  clearRules: (sessionId) => ipcRenderer.invoke("crest:clear-rules", { sessionId }),
  jump: (sessionId) => ipcRenderer.invoke("crest:jump", { sessionId }),
  dismiss: (sessionId) => ipcRenderer.invoke("crest:dismiss", { sessionId }),

  setConfig: (patch) => ipcRenderer.invoke("crest:config:set", patch),
  installHooks: () => ipcRenderer.invoke("crest:hooks:install"),
  uninstallHooks: () => ipcRenderer.invoke("crest:hooks:uninstall"),
  installEditorExtension: () => ipcRenderer.invoke("crest:vscode:install"),
  uninstallEditorExtension: () => ipcRenderer.invoke("crest:vscode:uninstall"),
  setAutostart: (enabled) => ipcRenderer.invoke("crest:autostart:set", { enabled }),
  installCodex: () => ipcRenderer.invoke("crest:codex:install"),
  uninstallCodex: () => ipcRenderer.invoke("crest:codex:uninstall"),
  refreshUsage: () => ipcRenderer.invoke("crest:usage:refresh"),
  openUsage: () => ipcRenderer.invoke("crest:usage:open"),
  closeUsage: () => ipcRenderer.send("crest:usage:close"),
  contextMenu: () => ipcRenderer.send("crest:context-menu"),
  revealConfig: () => ipcRenderer.invoke("crest:reveal-config"),
  openSettings: () => ipcRenderer.invoke("crest:open-settings"),
  quit: () => ipcRenderer.invoke("crest:quit"),

  setInteractive: (value) => ipcRenderer.send("crest:interactive", Boolean(value)),
  surface: () => ipcRenderer.send("crest:surface"),

  onLayout: (handler) => {
    const listener = (_event, value) => handler(value);
    ipcRenderer.on("crest:layout", listener);
    return () => ipcRenderer.removeListener("crest:layout", listener);
  },
  dragStart: () => ipcRenderer.send("crest:drag-start"),
  dragEnd: () => ipcRenderer.send("crest:drag-end"),
  releaseFocus: () => ipcRenderer.send("crest:release-focus"),

  onSummon: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("crest:summon", listener);
    return () => ipcRenderer.removeListener("crest:summon", listener);
  },
  resetPlacement: () => ipcRenderer.invoke("crest:reset-placement"),
});
