"use strict";

const path = require("path");

/**
 * Lancement au démarrage de Windows.
 *
 * L'état vit dans le registre, pas dans notre configuration : c'est Windows qui
 * fait foi, et l'utilisateur peut le retirer par le gestionnaire des tâches sans
 * que nous en soyons avertis. On lit donc toujours l'état réel plutôt que d'en
 * garder une copie qui pourrait mentir.
 */

/**
 * En développement, l'exécutable est celui d'Electron : sans le chemin du
 * projet en argument, l'entrée de démarrage lancerait l'application par défaut
 * d'Electron au lieu de Vibe Crest. Une fois empaqueté, l'exécutable est le
 * nôtre et aucun argument n'est nécessaire.
 */
function loginOptions(app) {
  if (app.isPackaged) return {};
  return { path: process.execPath, args: [path.resolve(app.getAppPath())] };
}

function isEnabled(app) {
  try {
    return app.getLoginItemSettings(loginOptions(app)).openAtLogin === true;
  } catch {
    return false;
  }
}

function setEnabled(app, enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), ...loginOptions(app) });
    return { ok: true, enabled: isEnabled(app) };
  } catch (err) {
    return { ok: false, enabled: isEnabled(app), reason: err.message };
  }
}

module.exports = { isEnabled, setEnabled };
