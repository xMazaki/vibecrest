"use strict";

const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } = require("electron");

const config = require("./config.cjs");
const { PipeServer } = require("./pipe-server.cjs");
const { SessionStore } = require("./sessions.cjs");
const hooksInstaller = require("./hooks-installer.cjs");
const { focusByPid, resolveScriptPath } = require("./terminal-focus.cjs");
const vscodeInstaller = require("./vscode-installer.cjs");
const codexInstaller = require("./codex-installer.cjs");
const autostart = require("./autostart.cjs");
const placement = require("./placement.cjs");
const usage = require("./usage.cjs");
const shortcut = require("./shortcut.cjs");

const IS_DEV = process.env.VIBE_CREST_DEV === "1";
const DEV_URL = "http://localhost:5174";

/** Cadence de suivi du curseur pendant un déplacement du pill. */
const DRAG_TICK_MS = 16;
/** Garde-fou si un relâchement de souris se perd. */
const DRAG_MAX_MS = 60000;

let pill = null;
let settings = null;
let usageWin = null;
let tray = null;
let pipe = null;
let store = null;
let lastTrayStatus = null;
let layout = null;
let drag = null;
/** Consommation, recalculée périodiquement plutôt qu'à chaque diffusion. */
let usageCache = null;
let usageTimer = null;

/** Intervalle de recalcul de la consommation. */
const USAGE_REFRESH_MS = 60000;

/* --------------------------------------------------------------------- */
/* Fenêtres                                                              */
/* --------------------------------------------------------------------- */

/** Écran portant un ancrage, avec repli sur l'écran principal s'il a disparu. */
function displayFor(place) {
  if (place?.displayId != null) {
    const chosen = screen.getAllDisplays().find((d) => d.id === place.displayId);
    if (chosen) return chosen;
  }
  return screen.getPrimaryDisplay();
}

/**
 * Applique un ancrage : redimensionne la fenêtre conteneur sur la région où le
 * pill peut grandir, puis transmet au rendu la position exacte de l'ancre à
 * l'intérieur de cette région.
 */
function applyLayout(override) {
  if (!pill || pill.isDestroyed()) return;
  const place = placement.normalize(override || config.load().placement);
  const next = placement.computeLayout(place, displayFor(place));
  layout = next;
  pill.setBounds(next.bounds);
  pill.webContents.send("crest:layout", next);
}

/* --------------------------------------------------------------------- */
/* Déplacement du pill à la souris                                       */
/* --------------------------------------------------------------------- */

/**
 * Le suivi se fait sur la position réelle du curseur plutôt que sur les
 * événements souris du rendu : c'est ce qui permet de traverser la bordure
 * entre deux écrans sans perdre le pointeur.
 *
 * L'ancre est posée sur le curseur, sans conserver l'écart qu'il y avait au
 * moment de la prise. C'est volontaire : l'appui replie le panneau, donc le
 * point saisi n'existe plus, et garder cet écart laisserait le pill loin de la
 * main. Le pill vient donc se placer sous le curseur, comme un objet qu'on
 * ramasse, puis le suit au pixel.
 */
function startDrag() {
  if (drag) return;
  drag = {
    startedAt: Date.now(),
    place: null,
    timer: setInterval(tickDrag, DRAG_TICK_MS),
  };
  tickDrag();
}

function tickDrag() {
  if (!drag) return;
  if (Date.now() - drag.startedAt > DRAG_MAX_MS) return endDrag();

  // L'écran sous le curseur, et non sous l'ancre : le passage d'un écran à
  // l'autre suit la main, pas la géométrie du pill.
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  drag.place = placement.snapPlacement(cursor, display);
  applyLayout(drag.place);
}

function endDrag() {
  if (!drag) return;
  clearInterval(drag.timer);
  const settled = drag.place;
  drag = null;
  if (settled) config.save({ placement: settled });
  applyLayout();
  broadcast();
}

function rendererUrl(hash) {
  if (IS_DEV) return `${DEV_URL}/#${hash}`;
  return `file://${path.join(__dirname, "..", "dist", "index.html")}#${hash}`;
}

function createPill() {
  const initial = placement.computeLayout(
    config.load().placement,
    displayFor(config.load().placement)
  );

  pill = new BrowserWindow({
    ...initial.bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Le niveau screen-saver fait passer le pill au dessus des applications
  // en plein écran, comportement attendu pour une surface de statut.
  pill.setAlwaysOnTop(true, "screen-saver");
  pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Au repos la fenêtre laisse tout passer. forward garde les mousemove pour
  // que le rendu détecte le survol et redemande l'interactivité au bon moment.
  pill.setIgnoreMouseEvents(true, { forward: true });

  pill.loadURL(rendererUrl("crest"));

  pill.once("ready-to-show", () => {
    applyLayout();
    // showInactive est le point critique : show() volerait le focus du
    // terminal à chaque événement, ce qui rendrait l'app inutilisable.
    pill.showInactive();
  });

  // Le rendu redemande sa géométrie après chaque rechargement.
  pill.webContents.on("did-finish-load", () => applyLayout());

  pill.on("closed", () => {
    pill = null;
  });

  return pill;
}

/**
 * Fenêtre flottante de consommation.
 *
 * Ce n'est pas le pill qui s'agrandit : le pill sert à décider vite, alors que
 * ces chiffres se lisent posément. Une surface distincte, posée contre le pill
 * et refermée dès qu'on regarde ailleurs, garde chaque chose à sa place.
 */
function usageBounds() {
  const width = 430;
  const height = 548;
  const place = placement.normalize(config.load().placement);
  const display = displayFor(place);
  const area = display.workArea;
  const anchor = placement.anchorPoint(place, display);
  const gap = 10;

  let x;
  let y;
  switch (place.edge) {
    case "bottom":
      x = anchor.x - width / 2;
      y = anchor.y - height - gap;
      break;
    case "left":
      x = anchor.x + gap;
      y = anchor.y - height / 2;
      break;
    case "right":
      x = anchor.x - width - gap;
      y = anchor.y - height / 2;
      break;
    default:
      x = anchor.x - width / 2;
      y = anchor.y + gap;
      break;
  }

  return {
    x: Math.round(Math.min(Math.max(x, area.x + 8), area.x + area.width - width - 8)),
    y: Math.round(Math.min(Math.max(y, area.y + 8), area.y + area.height - height - 8)),
    width,
    height,
  };
}

function createUsageWindow() {
  if (usageWin && !usageWin.isDestroyed()) {
    usageWin.setBounds(usageBounds());
    usageWin.show();
    usageWin.focus();
    return usageWin;
  }

  refreshUsage();

  usageWin = new BrowserWindow({
    ...usageBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  usageWin.setAlwaysOnTop(true, "screen-saver");
  usageWin.loadURL(rendererUrl("usage"));
  usageWin.once("ready-to-show", () => {
    usageWin.show();
    usageWin.focus();
  });
  // Comportement de surface éphémère : regarder ailleurs la referme.
  usageWin.on("blur", () => {
    if (usageWin && !usageWin.isDestroyed()) usageWin.close();
  });
  usageWin.on("closed", () => {
    usageWin = null;
  });

  return usageWin;
}

function createSettings(route = "settings") {
  if (settings && !settings.isDestroyed()) {
    settings.show();
    settings.focus();
    return settings;
  }
  settings = new BrowserWindow({
    width: route === "onboarding" ? 560 : 520,
    height: route === "onboarding" ? 680 : 640,
    title: "Vibe Crest",
    autoHideMenuBar: true,
    backgroundColor: "#0b0b0d",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settings.loadURL(rendererUrl(route));
  settings.once("ready-to-show", () => settings.show());
  settings.on("closed", () => {
    settings = null;
  });
  return settings;
}

/* --------------------------------------------------------------------- */
/* Icône de zone de notification                                         */
/* --------------------------------------------------------------------- */

function trayIcon(status) {
  const file = path.join(__dirname, "..", "build", `tray-${status}.png`);
  if (fs.existsSync(file)) {
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) return image;
  }
  return nativeImage.createEmpty();
}

function trayStatus() {
  const sessions = store.list();
  if (sessions.some((s) => s.status === "attention" || s.status === "question")) return "attention";
  if (sessions.some((s) => s.status === "waiting")) return "waiting";
  if (sessions.some((s) => s.status === "working")) return "working";
  return "idle";
}

function refreshTray() {
  if (!tray) return;
  const status = trayStatus();
  if (status !== lastTrayStatus) {
    tray.setImage(trayIcon(status));
    lastTrayStatus = status;
  }

  const sessions = store.list();
  const cfg = config.load();
  const label =
    sessions.length === 0
      ? "Aucune session"
      : `${sessions.length} session${sessions.length > 1 ? "s" : ""}`;
  tray.setToolTip(`Vibe Crest, ${label}`);

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Vibe Crest, ${label}`, enabled: false },
      { type: "separator" },
      {
        label: "Mode auto, tout approuver",
        type: "checkbox",
        checked: Boolean(cfg.autoMode),
        click: (item) => applyConfig({ autoMode: item.checked }),
      },
      {
        label: "Silence",
        type: "checkbox",
        checked: Boolean(cfg.muted),
        click: (item) => applyConfig({ muted: item.checked }),
      },
      { type: "separator" },
      { label: "Paramètres", click: () => createSettings() },
      {
        label: "Replacer le pill en haut au centre",
        click: () => {
          config.save({ placement: { ...placement.DEFAULT_PLACEMENT } });
          applyLayout();
          if (pill) pill.showInactive();
          broadcast();
        },
      },
      { type: "separator" },
      { label: "Quitter", click: () => app.quit() },
    ])
  );
}

/* --------------------------------------------------------------------- */
/* Diffusion de l'état vers le rendu                                     */
/* --------------------------------------------------------------------- */

/**
 * Recalcule la consommation. L'opération relit des transcriptions sur disque,
 * elle est donc périodique et mise en cache plutôt que refaite à chaque
 * diffusion d'état, qui survient à chaque événement de hook.
 */
function refreshUsage() {
  try {
    usageCache = { ...usage.compute(), codex: usage.computeCodex() };
  } catch {
    usageCache = null;
  }
  return usageCache;
}

function snapshot() {
  const cfg = config.load();
  return {
    sessions: store.list(),
    config: cfg,
    hooks: hooksInstaller.status(),
    editors: vscodeInstaller.status(),
    codex: codexInstaller.status(),
    usage: usageCache,
    shortcut: shortcut.status(),
    // Lu dans le registre à chaque instantané : Windows fait foi, l'entrée peut
    // être retirée par le gestionnaire des tâches sans nous prévenir.
    autostart: autostart.isEnabled(app),
    layout,
    placementLabel: placement.describe(cfg.placement),
    pipeReady: Boolean(pipe?.server?.listening),
  };
}

function broadcast() {
  const state = snapshot();
  for (const win of [pill, settings, usageWin]) {
    if (win && !win.isDestroyed()) win.webContents.send("crest:state", state);
  }
  refreshTray();
}

/**
 * Convocation au clavier.
 *
 * C'est le seul endroit où l'on prend délibérément le focus : l'utilisateur
 * vient de le demander, et sans focus la fenêtre ne recevrait aucune touche.
 * Le reste du temps le pill apparaît toujours par showInactive.
 */
function summon() {
  if (!pill || pill.isDestroyed()) return;
  applyLayout();
  pill.setIgnoreMouseEvents(false);
  pill.show();
  pill.focus();
  pill.webContents.send("crest:summon");
}

function applyShortcut() {
  return shortcut.apply(config.load().summonShortcut, summon);
}

function applyConfig(patch) {
  const next = config.save(patch);
  store.setConfig(next);
  applyLayout();
  if ("summonShortcut" in patch) applyShortcut();
  broadcast();
  return next;
}

/* --------------------------------------------------------------------- */
/* Canal IPC                                                             */
/* --------------------------------------------------------------------- */

function registerIpc() {
  ipcMain.handle("crest:snapshot", () => snapshot());

  ipcMain.handle("crest:decide", (_e, { requestId, decision, reason }) => {
    const verdict = decision === "deny" ? "deny" : "allow";
    const ok = pipe.resolve(requestId, verdict, reason);
    store.clearPending(requestId, verdict === "deny" ? "refusé" : "approuvé");
    broadcast();
    return ok;
  });

  /**
   * Réponse à une question posée par l'agent.
   *
   * Le motif transmis est rédigé pour être lu par le modèle : il annonce que la
   * réponse vient de l'utilisateur et que l'outil n'a donc pas été exécuté.
   */
  ipcMain.handle("crest:answer", (_e, { requestId, answers }) => {
    const lines = (Array.isArray(answers) ? answers : [])
      .filter((a) => a && a.question)
      .map((a) => `« ${a.question} » : « ${a.answer} »`);

    const reason =
      "Réponse de l'utilisateur, donnée dans Vibe Crest. L'outil AskUserQuestion " +
      "n'a donc pas été exécuté, mais la réponse ci-dessous fait foi. " +
      lines.join(" ") +
      " Poursuis avec cette réponse sans reposer la question.";

    const ok = pipe.resolve(requestId, "answer", reason);
    store.clearQuestion(requestId, "réponse donnée depuis le pill");
    broadcast();
    return ok;
  });

  /** Renvoie la question au terminal : aucune décision, flux natif restauré. */
  ipcMain.handle("crest:skip-question", (_e, { requestId }) => {
    pipe.resolve(requestId, null);
    store.clearQuestion(requestId, "question renvoyée au terminal");
    broadcast();
    return true;
  });

  // Applique une règle de session puis solde la demande en cours.
  ipcMain.handle("crest:always", (_e, { requestId, sessionId, toolName }) => {
    store.addRule(sessionId, toolName);
    const ok = pipe.resolve(requestId, "allow", "Règle de session Vibe Crest");
    store.clearPending(requestId, "règle");
    broadcast();
    return ok;
  });

  ipcMain.handle("crest:clear-rules", (_e, { sessionId }) => {
    const changed = store.clearRules(sessionId);
    broadcast();
    return changed;
  });

  ipcMain.handle("crest:jump", async (_e, { sessionId }) => {
    const session = store.get(sessionId);
    if (!session?.ppid) {
      return { ok: false, reason: "Aucun processus terminal associé à cette session" };
    }

    // Premier temps : activer la fenêtre, ce qui marche pour tous les hôtes.
    // L'hôte détecté oriente le choix dans la chaîne des parents.
    const result = await focusByPid(session.ppid, resolveScriptPath(app), session.host?.exe || "");

    // Second temps, dans un éditeur : viser le panneau de terminal exact. La
    // fenêtre est déjà au premier plan, donc l'URI est routée vers la bonne.
    const uri = vscodeInstaller.focusUri(session.host?.kind, result.pids);
    if (uri) {
      try {
        await shell.openExternal(uri);
        return { ...result, ok: true, precise: true };
      } catch {
        // L'activation de la fenêtre reste acquise, on ne dégrade rien.
      }
    }

    return result;
  });

  ipcMain.handle("crest:vscode:install", () => {
    const source = app.isPackaged
      ? path.join(process.resourcesPath, "vscode-extension")
      : path.join(__dirname, "vscode-extension");
    const results = vscodeInstaller.install(source);
    broadcast();
    return { ok: results.every((r) => r.ok), results };
  });

  ipcMain.handle("crest:usage:refresh", () => {
    refreshUsage();
    broadcast();
    return usageCache;
  });

  ipcMain.handle("crest:usage:open", () => {
    createUsageWindow();
    return true;
  });

  ipcMain.on("crest:usage:close", () => {
    if (usageWin && !usageWin.isDestroyed()) usageWin.close();
  });

  ipcMain.handle("crest:codex:install", () => {
    const result = codexInstaller.install();
    broadcast();
    return result;
  });

  ipcMain.handle("crest:codex:uninstall", () => {
    const result = codexInstaller.uninstall();
    broadcast();
    return result;
  });

  /**
   * Menu contextuel sur le pill. Il double le menu de la zone de notification
   * là où se trouve déjà la souris, ce qui évite un aller-retour vers la barre
   * des tâches pour un réglage courant.
   */
  ipcMain.on("crest:context-menu", () => {
    if (!pill || pill.isDestroyed()) return;
    const cfg = config.load();
    Menu.buildFromTemplate([
      {
        label: "Mode auto, tout approuver",
        type: "checkbox",
        checked: Boolean(cfg.autoMode),
        click: (item) => applyConfig({ autoMode: item.checked }),
      },
      {
        label: "Silence",
        type: "checkbox",
        checked: Boolean(cfg.muted),
        click: (item) => applyConfig({ muted: item.checked }),
      },
      {
        label: "Réduire à un liseré au repos",
        type: "checkbox",
        checked: Boolean(cfg.minimizeWhenIdle),
        click: (item) => applyConfig({ minimizeWhenIdle: item.checked }),
      },
      { type: "separator" },
      { label: "Paramètres", click: () => createSettings() },
      {
        label: "Replacer en haut au centre",
        click: () => {
          config.save({ placement: { ...placement.DEFAULT_PLACEMENT } });
          applyLayout();
          broadcast();
        },
      },
      { type: "separator" },
      { label: "Quitter Vibe Crest", click: () => app.quit() },
    ]).popup({ window: pill });
  });

  ipcMain.handle("crest:autostart:set", (_e, { enabled }) => {
    const result = autostart.setEnabled(app, enabled);
    broadcast();
    return result;
  });

  ipcMain.handle("crest:vscode:uninstall", () => {
    const results = vscodeInstaller.uninstall();
    broadcast();
    return { ok: results.every((r) => r.ok), results };
  });

  ipcMain.handle("crest:dismiss", (_e, { sessionId }) => {
    store.dismiss(sessionId);
    broadcast();
    return true;
  });

  ipcMain.handle("crest:config:set", (_e, patch) => applyConfig(patch || {}));

  ipcMain.handle("crest:hooks:install", () => {
    try {
      const source = app.isPackaged
        ? path.join(process.resourcesPath, "agent-hook.cjs")
        : path.join(__dirname, "agent-hook.cjs");
      const result = hooksInstaller.install(source);
      broadcast();
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("crest:hooks:uninstall", () => {
    try {
      const result = hooksInstaller.uninstall();
      broadcast();
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("crest:open-settings", () => {
    createSettings();
    return true;
  });

  ipcMain.handle("crest:reveal-config", async () => {
    // Le fichier peut ne pas encore exister si aucun réglage n'a été modifié.
    // On le matérialise d'abord, sans quoi l'explorateur ne fait rien.
    try {
      config.materialize();
      shell.showItemInFolder(config.configPath);
      return { ok: true };
    } catch {
      const error = await shell.openPath(config.configDir);
      return { ok: !error, reason: error || undefined };
    }
  });

  ipcMain.handle("crest:quit", () => app.quit());

  // Bascule de l'interactivité selon le survol, envoyée par le rendu.
  ipcMain.on("crest:interactive", (_e, interactive) => {
    if (!pill || pill.isDestroyed()) return;
    if (interactive) pill.setIgnoreMouseEvents(false);
    else pill.setIgnoreMouseEvents(true, { forward: true });
  });

  // Le rendu prévient qu'un événement mérite d'être vu. On réaffirme la
  // géométrie et la position au dessus des autres fenêtres, jamais le focus.
  ipcMain.on("crest:surface", () => {
    if (!pill || pill.isDestroyed()) return;
    applyLayout();
    if (!pill.isVisible()) pill.showInactive();
    pill.setAlwaysOnTop(true, "screen-saver");
  });

  ipcMain.on("crest:drag-start", () => startDrag());
  ipcMain.on("crest:drag-end", () => endDrag());

  /**
   * Rend le focus après une convocation au clavier. Sans cela le pill garderait
   * le clavier et l'utilisateur devrait cliquer ailleurs pour revenir à son
   * travail, ce qui est exactement ce que l'application cherche à éviter.
   */
  ipcMain.on("crest:release-focus", () => {
    if (!pill || pill.isDestroyed()) return;
    pill.blur();
    pill.setIgnoreMouseEvents(true, { forward: true });
  });

  ipcMain.handle("crest:reset-placement", () => {
    const next = config.save({ placement: { ...placement.DEFAULT_PLACEMENT } });
    applyLayout();
    broadcast();
    return next.placement;
  });
}

/* --------------------------------------------------------------------- */
/* Démarrage                                                             */
/* --------------------------------------------------------------------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (pill && !pill.isDestroyed()) {
      applyLayout();
      pill.showInactive();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("app.vibecrest.desktop");
    config.materialize();

    // La copie du hook posée dans le profil suit la version embarquée.
    const hookSource = app.isPackaged
      ? path.join(process.resourcesPath, "agent-hook.cjs")
      : path.join(__dirname, "agent-hook.cjs");
    const refresh = hooksInstaller.refreshHookScript(hookSource);
    if (refresh.refreshed) {
      console.log("Script de hook mis à jour, la prochaine session en profitera.");
    }

    store = new SessionStore(config.load());
    store.on("changed", broadcast);

    pipe = new PipeServer();
    pipe.on("event", (event, requestId) => {
      // Une règle de session court-circuite la demande : on rend la main tout
      // de suite et l'appel apparaît au journal comme un appel ordinaire.
      if (requestId && store.isAutoAllowed(event.sessionId, event.toolName)) {
        pipe.resolve(requestId, "allow", "Règle de session Vibe Crest");
        store.apply(event, null, { auto: true });
        return;
      }

      store.apply(event, requestId);
      if (requestId || event.isQuestion || event.event === "Notification") {
        if (pill && !pill.isDestroyed() && !pill.isVisible()) pill.showInactive();
      }
    });
    pipe.on("abandoned", (requestId) => {
      store.clearPending(requestId, "abandonné");
      store.clearQuestion(requestId, "question abandonnée");
      broadcast();
    });

    try {
      await pipe.start();
    } catch (err) {
      // Un pipe déjà pris signifie presque toujours une instance résiduelle.
      console.error("Impossible d'ouvrir le named pipe:", err.message);
    }

    createPill();
    tray = new Tray(trayIcon("idle"));
    registerIpc();
    refreshTray();

    // Première mise en route : sans hooks installés, l'application ne recevrait
    // rien et paraîtrait cassée. Mieux vaut accompagner que laisser deviner.
    if (!config.load().onboarded) createSettings("onboarding");

    applyShortcut();

    refreshUsage();
    usageTimer = setInterval(() => {
      refreshUsage();
      broadcast();
    }, USAGE_REFRESH_MS);
    usageTimer.unref?.();

    const reflow = () => applyLayout();
    screen.on("display-metrics-changed", reflow);
    screen.on("display-added", reflow);
    screen.on("display-removed", reflow);
  });

  app.on("window-all-closed", (e) => {
    // L'app vit dans la zone de notification, fermer une fenêtre ne la quitte pas.
    e.preventDefault?.();
  });

  app.on("before-quit", () => {
    if (usageTimer) clearInterval(usageTimer);
    shortcut.unregister();
    pipe?.stop();
    tray?.destroy();
  });
}
