"use strict";

const fs = require("fs");
const path = require("path");
const { CLAUDE_DIR, CLAUDE_SETTINGS, HOME_DIR, HOOK_SCRIPT } = require("./paths.cjs");

/** Marqueur qui nous permet de reconnaître nos propres entrées et de les retirer proprement. */
const TAG = "vibe-crest";

/** Événements sans matcher dans le schéma de Claude Code. */
const PLAIN_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  // Fin d'un sous-agent : c'est ce qui permet de clore proprement une entrée
  // de sous-agent dans le journal et d'en connaître la durée.
  "SubagentStop",
  "SessionEnd",
];
/** Événements qui acceptent un matcher sur le nom de l'outil. */
const MATCHED_EVENTS = ["PreToolUse", "PostToolUse"];

function hookCommand() {
  // node est résolu depuis le PATH. On cite le chemin, qui contient presque
  // toujours un espace dans un profil utilisateur Windows.
  return `node "${HOOK_SCRIPT}"`;
}

function entry() {
  return { type: "command", command: hookCommand(), timeout: 300, [TAG]: true };
}

function isOurs(hook) {
  return Boolean(hook && (hook[TAG] === true || (typeof hook.command === "string" && hook.command.includes(".vibecrest"))));
}

/**
 * Copie le script de hook vers un emplacement stable du profil utilisateur.
 * On ne référence jamais un chemin interne à l'app, qui changerait à chaque mise à jour.
 */
function stageHookScript(sourcePath) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.copyFileSync(sourcePath, HOOK_SCRIPT);
  return HOOK_SCRIPT;
}

/**
 * Aligne la copie du script de hook sur celle qu'embarque l'application.
 *
 * Deux cas sont traités, et le second est le plus important.
 *
 * Mise à jour : sans cette remise à niveau, une nouvelle version de Vibe Crest
 * laisserait en place l'ancien script et les nouveautés du protocole
 * passeraient à la trappe.
 *
 * Réparation : si le script a disparu alors que ses appels restent inscrits
 * dans les réglages de Claude Code, chaque événement produirait une trace
 * d'erreur dans la conversation. C'est ce qui arrive quand on supprime le
 * dossier de l'application, ou qu'on la désinstalle sans retirer les hooks au
 * préalable. On restaure alors le fichier au lieu de laisser la situation
 * pourrir en silence.
 */
function refreshHookScript(sourcePath) {
  try {
    if (!fs.existsSync(HOOK_SCRIPT)) {
      const registered = status();
      if (!registered.installed && !registered.partial) {
        return { refreshed: false, reason: "absent" };
      }
      stageHookScript(sourcePath);
      return { refreshed: true, repaired: true };
    }

    const current = fs.readFileSync(HOOK_SCRIPT, "utf8");
    const next = fs.readFileSync(sourcePath, "utf8");
    if (current === next) return { refreshed: false, reason: "identique" };
    fs.writeFileSync(HOOK_SCRIPT, next, "utf8");
    return { refreshed: true };
  } catch (err) {
    return { refreshed: false, reason: err.message };
  }
}

/**
 * Lit les settings de Claude Code sans jamais risquer de les perdre.
 * Un fichier illisible fait échouer l'installation au lieu de l'écraser, ce qui
 * est précisément le défaut relevé dans les implémentations concurrentes.
 */
function readSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS)) return { settings: {}, existed: false };
  // La marque d'ordre des octets, posée par de nombreux éditeurs Windows,
  // ferait échouer l'analyse et donc refuser l'installation à tort.
  let raw = fs.readFileSync(CLAUDE_SETTINGS, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  if (!raw.trim()) return { settings: {}, existed: true };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Le fichier ${CLAUDE_SETTINGS} n'est pas un JSON valide (${err.message}). ` +
        `Vibe Crest refuse de l'écraser. Corrigez-le puis relancez l'installation.`
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Le fichier ${CLAUDE_SETTINGS} ne contient pas un objet JSON.`);
  }
  return { settings: parsed, existed: true };
}

function writeSettings(settings, makeBackup) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  if (makeBackup && fs.existsSync(CLAUDE_SETTINGS)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(CLAUDE_SETTINGS, path.join(CLAUDE_DIR, `settings.backup-${stamp}.json`));
  }
  const tmp = CLAUDE_SETTINGS + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), "utf8");
  fs.renameSync(tmp, CLAUDE_SETTINGS);
}

/** Retire nos entrées d'un tableau de groupes de hooks, en préservant celles des autres. */
function stripOurs(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => {
      if (!group || !Array.isArray(group.hooks)) return group;
      return { ...group, hooks: group.hooks.filter((h) => !isOurs(h)) };
    })
    .filter((group) => !group || !Array.isArray(group.hooks) || group.hooks.length > 0);
}

function install(sourcePath) {
  const scriptPath = stageHookScript(sourcePath);
  const { settings, existed } = readSettings();

  const hooks = settings.hooks && typeof settings.hooks === "object" ? { ...settings.hooks } : {};

  for (const event of PLAIN_EVENTS) {
    const cleaned = stripOurs(hooks[event]);
    hooks[event] = [...cleaned, { hooks: [entry()] }];
  }
  for (const event of MATCHED_EVENTS) {
    const cleaned = stripOurs(hooks[event]);
    hooks[event] = [...cleaned, { matcher: "*", hooks: [entry()] }];
  }

  writeSettings({ ...settings, hooks }, existed);
  return { scriptPath, settingsPath: CLAUDE_SETTINGS, backedUp: existed };
}

function uninstall() {
  const { settings, existed } = readSettings();
  if (!existed || !settings.hooks) return { removed: false };

  const hooks = { ...settings.hooks };
  for (const event of [...PLAIN_EVENTS, ...MATCHED_EVENTS]) {
    const cleaned = stripOurs(hooks[event]);
    if (cleaned.length === 0) delete hooks[event];
    else hooks[event] = cleaned;
  }

  const next = { ...settings };
  if (Object.keys(hooks).length === 0) delete next.hooks;
  else next.hooks = hooks;

  writeSettings(next, true);
  try {
    fs.rmSync(HOOK_SCRIPT, { force: true });
  } catch {
    /* le script a déjà disparu */
  }
  return { removed: true, settingsPath: CLAUDE_SETTINGS };
}

/** Vérifie si nos hooks sont en place, sans rien modifier. */
function status() {
  try {
    const { settings } = readSettings();
    const hooks = settings.hooks || {};
    const events = [...PLAIN_EVENTS, ...MATCHED_EVENTS];
    const present = events.filter((event) =>
      (hooks[event] || []).some((group) => (group?.hooks || []).some(isOurs))
    );
    return {
      installed: present.length === events.length,
      partial: present.length > 0 && present.length < events.length,
      events: present,
      scriptPresent: fs.existsSync(HOOK_SCRIPT),
      error: null,
    };
  } catch (err) {
    return { installed: false, partial: false, events: [], scriptPresent: false, error: err.message };
  }
}

module.exports = { install, uninstall, status, hookCommand, refreshHookScript };
