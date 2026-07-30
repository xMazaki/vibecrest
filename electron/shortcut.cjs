"use strict";

const { globalShortcut } = require("electron");

/**
 * Raccourci global de convocation.
 *
 * Un raccourci global peut déjà être pris par une autre application, et
 * Electron ne le signale que par une valeur de retour. On conserve donc l'état
 * réel de l'enregistrement pour pouvoir le dire dans les réglages plutôt que de
 * laisser l'utilisateur se demander pourquoi rien ne se passe.
 */

let current = null;
let lastError = null;

function unregister() {
  if (current) {
    try {
      globalShortcut.unregister(current);
    } catch {
      /* déjà libéré */
    }
  }
  current = null;
}

/**
 * Enregistre l'accélérateur demandé. Retourne l'état à présenter dans les
 * réglages : ce qui est actif, et pourquoi le cas échéant ça ne l'est pas.
 */
function apply(accelerator, handler) {
  unregister();
  lastError = null;

  const wanted = String(accelerator || "").trim();
  if (!wanted) return status();

  try {
    const ok = globalShortcut.register(wanted, handler);
    if (ok) current = wanted;
    else lastError = "Ce raccourci est déjà utilisé par une autre application.";
  } catch (err) {
    lastError = err.message;
  }

  return status();
}

function status() {
  return { accelerator: current, error: lastError };
}

module.exports = { apply, unregister, status };
