"use strict";

const os = require("os");
const path = require("path");

/** Nom du named pipe Windows utilisé entre les hooks et l'app. */
const PIPE_NAME = "\\\\.\\pipe\\vibe-crest";

/** Dossier de travail de l'app dans le profil utilisateur. */
const HOME_DIR = path.join(os.homedir(), ".vibecrest");

/** Copie stable du script de hook, référencée par les settings de Claude Code. */
const HOOK_SCRIPT = path.join(HOME_DIR, "agent-hook.cjs");

/** Configuration de Vibe Crest. */
const CONFIG_FILE = path.join(HOME_DIR, "config.json");

/** Racine de configuration de Claude Code. */
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, "settings.json");

module.exports = {
  PIPE_NAME,
  HOME_DIR,
  HOOK_SCRIPT,
  CONFIG_FILE,
  CLAUDE_DIR,
  CLAUDE_SETTINGS,
};
