"use strict";

const fs = require("fs");
const path = require("path");
const { CONFIG_FILE, HOME_DIR } = require("./paths.cjs");
const { DEFAULT_PLACEMENT, normalize } = require("./placement.cjs");

const DEFAULTS = {
  /**
   * Outils dont l'exécution passe par une approbation dans le pill.
   *
   * La liste couvre tout ce pour quoi Claude Code demande habituellement une
   * confirmation. Un outil absent d'ici garde son invite dans le terminal, ce
   * qui est la cause la plus fréquente d'une demande qui n'apparaît pas dans
   * le pill. ExitPlanMode est la validation de plan, mcp__* couvre d'un bloc
   * tous les outils fournis par des serveurs MCP.
   */
  gatedTools: [
    "Bash",
    // Sur Windows, Claude Code expose un outil PowerShell distinct de Bash.
    // Son absence de cette liste est passée inaperçue longtemps, puisque les
    // commandes partaient alors dans l'invite du terminal sans erreur visible.
    "PowerShell",
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookEdit",
    "WebFetch",
    "WebSearch",
    "ExitPlanMode",
    "mcp__*",
  ],
  /** Approuve tout sans demander, pour les sessions de confiance. */
  autoMode: false,
  /** Coupe les signaux sonores. */
  muted: false,
  /** Joue un son court sur les événements qui réclament une décision. */
  sounds: true,
  /**
   * Réduit le pill à un simple liseré quand rien ne se passe.
   *
   * Désactivé par défaut : un liseré noir ne dit rien, alors que la forme
   * compacte tient en une ligne et annonce toujours son état, ne serait-ce que
   * « aucune session ». La discrétion maximale reste disponible pour qui la
   * préfère.
   */
  minimizeWhenIdle: false,
  /** Passe à vrai une fois la mise en route terminée. */
  onboarded: false,
  /**
   * Raccourci global qui fait venir le pill et lui donne le clavier.
   * Chaîne vide pour n'en enregistrer aucun.
   */
  summonShortcut: "Alt+G",
  /**
   * Repère personnel de jetons par fenêtre de cinq heures. Zéro pour aucun.
   *
   * La limite réelle d'un abonnement n'est pas lisible localement : plutôt que
   * d'inventer un dénominateur, on laisse l'utilisateur poser le sien s'il en
   * connaît un, et la jauge n'apparaît que dans ce cas.
   */
  usageLimit: 0,
  /**
   * Délai avant qu'une session au repos quitte le pill, en millisecondes.
   * Zéro désactive le retrait automatique, ce qui est le comportement voulu :
   * la fin d'un tour n'est pas la fin de la session.
   */
  dismissAfterMs: 0,
  /** Attente maximale d'une décision avant de rendre la main à Claude Code. */
  decisionTimeoutMs: 240000,
  /**
   * Ancrage du pill, posé en le déplaçant à la souris. Les positions sont
   * fractionnaires pour survivre à un changement de résolution.
   */
  placement: { ...DEFAULT_PLACEMENT },
};

/** Réglages remplacés par le déplacement direct du pill. */
const OBSOLETE_KEYS = ["followCursor", "displayId", "offsetX"];

/**
 * Listes d'outils livrées par le passé, dans l'ordre chronologique.
 *
 * Une configuration qui reproduit l'une d'elles à l'identique n'a jamais été
 * personnalisée : on peut l'aligner sur la liste courante sans écraser un choix
 * délibéré. Chaque entrée correspond à un oubli corrigé depuis, la validation
 * de plan et les outils MCP pour la première, l'outil PowerShell pour la
 * seconde.
 */
const PREVIOUS_DEFAULTS = [
  ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit", "WebFetch"],
  [
    "Bash",
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookEdit",
    "WebFetch",
    "WebSearch",
    "ExitPlanMode",
    "mcp__*",
  ],
];

function sameSet(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

let cache = null;
/** Une migration a modifié la configuration et doit être écrite sur disque. */
let pendingWrite = false;

function ensureDir() {
  fs.mkdirSync(HOME_DIR, { recursive: true });
}

/**
 * Retire la marque d'ordre des octets. Notepad, Set-Content et bien d'autres
 * outils Windows la posent en tête des fichiers UTF-8, et JSON.parse la rejette.
 * Sans ce nettoyage, éditer sa configuration à la main la ferait repartir en
 * silence aux valeurs par défaut.
 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function load() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(stripBom(fs.readFileSync(CONFIG_FILE, "utf8"))) || {};
  } catch {
    stored = {};
  }
  // Les réglages remplacés sont retirés au lieu d'être conservés en silence,
  // pour que le fichier reflète ce que l'application sait encore lire.
  for (const key of OBSOLETE_KEYS) delete stored[key];

  cache = { ...DEFAULTS, ...stored };
  cache.placement = normalize(cache.placement);

  if (PREVIOUS_DEFAULTS.some((previous) => sameSet(cache.gatedTools, previous))) {
    cache.gatedTools = [...DEFAULTS.gatedTools];
    // À persister : le hook relit ce fichier à chaque événement et ne verrait
    // pas une migration restée en mémoire.
    pendingWrite = true;
  }
  if (OBSOLETE_KEYS.some((key) => key in (stored || {}))) pendingWrite = true;

  return cache;
}

function write(next) {
  ensureDir();
  // Écriture atomique, pour ne jamais laisser un fichier de config tronqué.
  const tmp = CONFIG_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, CONFIG_FILE);
}

function save(patch) {
  const next = { ...load(), ...patch };
  cache = next;
  write(next);
  return next;
}

/**
 * Matérialise le fichier au premier lancement. Sans cela, le bouton qui révèle
 * la configuration pointerait vers un fichier absent et ne ferait rien.
 */
function materialize() {
  ensureDir();
  const current = load();
  if (!fs.existsSync(CONFIG_FILE) || pendingWrite) {
    write(current);
    pendingWrite = false;
  }
  return CONFIG_FILE;
}

module.exports = {
  DEFAULTS,
  load,
  save,
  ensureDir,
  materialize,
  configPath: CONFIG_FILE,
  configDir: path.dirname(CONFIG_FILE),
};
