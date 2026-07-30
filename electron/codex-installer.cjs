"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { HOOK_SCRIPT } = require("./paths.cjs");

/**
 * Intégration de Codex CLI.
 *
 * Codex n'offre qu'un seul point d'accroche, la clé racine `notify` de
 * ~/.codex/config.toml, et un seul événement, `agent-turn-complete`. La charge
 * utile arrive en premier argument de la commande, et non sur l'entrée standard
 * comme chez Claude Code.
 *
 * Conséquence : avec Codex, Vibe Crest sait dire qu'un tour est terminé, rien
 * de plus. Pas d'approbation d'autorisation, pas de journal des appels d'outils.
 */

const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_CONFIG = path.join(CODEX_DIR, "config.toml");

/** Marqueur de nos lignes, pour les reconnaître et les retirer proprement. */
const MARKER = "# vibe-crest";

/**
 * Chemins en barres obliques : TOML impose d'échapper les antislashs dans une
 * chaîne de base, et Node accepte les barres obliques sous Windows. On évite
 * ainsi une classe entière d'erreurs de quotage.
 */
function notifyLine() {
  const script = HOOK_SCRIPT.replace(/\\/g, "/");
  return `notify = ["node", "${script}", "--codex"]  ${MARKER}`;
}

function read() {
  if (!fs.existsSync(CODEX_CONFIG)) return { text: "", existed: false };
  let text = fs.readFileSync(CODEX_CONFIG, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, existed: true };
}

function backup() {
  if (!fs.existsSync(CODEX_CONFIG)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(CODEX_CONFIG, path.join(CODEX_DIR, `config.backup-${stamp}.toml`));
}

/** Indice de la première table TOML, au delà de laquelle une clé racine serait ignorée. */
function firstTableIndex(lines) {
  const index = lines.findIndex((line) => /^\s*\[/.test(line));
  return index === -1 ? lines.length : index;
}

/**
 * Retire nos lignes et toute clé `notify` racine existante.
 * Un tableau `notify` réparti sur plusieurs lignes n'est pas manipulé : on
 * préfère refuser que réécrire de travers une configuration qu'on ne comprend
 * pas entièrement.
 */
function strip(lines) {
  const limit = firstTableIndex(lines);
  const kept = [];
  let multilineRefusal = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i < limit && /^\s*notify\s*=/.test(line)) {
      if (line.includes(MARKER)) continue;
      // Une valeur qui ne se referme pas sur la ligne est un tableau multiligne.
      const opens = (line.match(/\[/g) || []).length;
      const closes = (line.match(/\]/g) || []).length;
      if (opens !== closes) multilineRefusal = true;
      continue;
    }
    kept.push(line);
  }

  return { kept, multilineRefusal };
}

function status() {
  if (!fs.existsSync(CODEX_DIR)) return { present: false, installed: false, error: null };
  try {
    const { text } = read();
    return { present: true, installed: text.includes(MARKER), error: null };
  } catch (err) {
    return { present: true, installed: false, error: err.message };
  }
}

function install() {
  if (!fs.existsSync(CODEX_DIR)) {
    return { ok: false, error: "Codex n'est pas installé sur cette machine." };
  }

  const { text, existed } = read();
  const lines = text.length ? text.split(/\r?\n/) : [];
  const { kept, multilineRefusal } = strip(lines);

  if (multilineRefusal) {
    return {
      ok: false,
      error:
        "Votre config.toml contient une clé notify répartie sur plusieurs lignes. " +
        "Vibe Crest préfère ne pas la réécrire : retirez-la puis relancez l'installation.",
    };
  }

  if (existed) backup();

  // La clé racine doit précéder toute table, sinon TOML la rattacherait à celle
  // qui la précède et Codex ne la verrait jamais.
  const next = [notifyLine(), ...kept].join("\n").replace(/\n{3,}/g, "\n\n");
  fs.mkdirSync(CODEX_DIR, { recursive: true });
  const tmp = CODEX_CONFIG + ".tmp";
  fs.writeFileSync(tmp, next.endsWith("\n") ? next : next + "\n", "utf8");
  fs.renameSync(tmp, CODEX_CONFIG);

  return { ok: true, configPath: CODEX_CONFIG, backedUp: existed };
}

function uninstall() {
  if (!fs.existsSync(CODEX_CONFIG)) return { ok: true, removed: false };
  const { text } = read();
  if (!text.includes(MARKER)) return { ok: true, removed: false };

  backup();
  const kept = text.split(/\r?\n/).filter((line) => !line.includes(MARKER));
  const tmp = CODEX_CONFIG + ".tmp";
  fs.writeFileSync(tmp, kept.join("\n"), "utf8");
  fs.renameSync(tmp, CODEX_CONFIG);
  return { ok: true, removed: true };
}

module.exports = { install, uninstall, status, CODEX_CONFIG };
