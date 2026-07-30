"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Suivi de la consommation, dérivé des transcriptions locales.
 *
 * Claude Code écrit une transcription par session dans
 * ~/.claude/projects/<projet>/<session>.jsonl. Chaque ligne d'assistant porte
 * un horodatage et un objet `usage` détaillant les jetons. Tout se calcule donc
 * hors ligne, sans appel réseau ni clé d'API.
 *
 * Ce que l'on n'affiche pas volontairement : un pourcentage de quota. La limite
 * réelle dépend de l'abonnement et n'est pas lisible localement ; annoncer un
 * pourcentage reviendrait à inventer le dénominateur.
 */

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

/** Fenêtre glissante de référence des limites d'usage. */
const WINDOW_MS = 5 * 60 * 60 * 1000;
/** On ignore les fichiers plus vieux que cela, ils ne peuvent rien apporter. */
const FILE_HORIZON_MS = 26 * 60 * 60 * 1000;
/** Garde-fou : volume maximal relu à chaque rafraîchissement. */
const MAX_BYTES = 64 * 1024 * 1024;

/** Cache par fichier, invalidé sur la taille et la date de modification. */
const cache = new Map();

function listTranscripts(now) {
  let projects;
  try {
    projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, project.name);
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(dir, name);
      try {
        const stat = fs.statSync(file);
        if (now - stat.mtimeMs > FILE_HORIZON_MS) continue;
        files.push({ file, size: stat.size, mtime: stat.mtimeMs, project: project.name });
      } catch {
        /* fichier disparu entre le listage et la lecture */
      }
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

function emptyBucket() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, turns: 0 };
}

function addUsage(bucket, usage) {
  bucket.input += Number(usage.input_tokens) || 0;
  bucket.output += Number(usage.output_tokens) || 0;
  bucket.cacheWrite += Number(usage.cache_creation_input_tokens) || 0;
  bucket.cacheRead += Number(usage.cache_read_input_tokens) || 0;
  bucket.turns += 1;
}

/** Extrait les points de consommation d'une transcription, avec cache. */
function readPoints(entry) {
  const cached = cache.get(entry.file);
  if (cached && cached.size === entry.size && cached.mtime === entry.mtime) return cached.points;

  let raw;
  try {
    raw = fs.readFileSync(entry.file, "utf8");
  } catch {
    return [];
  }

  const points = [];
  for (const line of raw.split("\n")) {
    if (!line || line.indexOf('"usage"') === -1) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = record?.message?.usage;
    if (!usage || !record.timestamp) continue;
    const at = Date.parse(record.timestamp);
    if (!Number.isFinite(at)) continue;
    points.push({
      at,
      model: record.message.model || "inconnu",
      // isSidechain marque les messages produits par un sous-agent.
      sidechain: record.isSidechain === true,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
      },
    });
  }

  cache.set(entry.file, { size: entry.size, mtime: entry.mtime, points });
  return points;
}

function startOfToday(now) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Agrège la consommation. `now` est injectable pour rendre le calcul testable.
 */
function compute(now = Date.now()) {
  const files = listTranscripts(now);
  const windowFrom = now - WINDOW_MS;
  const dayFrom = startOfToday(now);

  const window = emptyBucket();
  const today = emptyBucket();
  const byModel = new Map();
  let oldestInWindow = null;
  let lastActivity = null;
  let bytes = 0;
  let truncated = false;

  for (const entry of files) {
    if (bytes + entry.size > MAX_BYTES) {
      truncated = true;
      break;
    }
    bytes += entry.size;

    for (const point of readPoints(entry)) {
      if (point.at > (lastActivity ?? 0)) lastActivity = point.at;
      if (point.at >= dayFrom) addUsage(today, point.usage);
      if (point.at >= windowFrom) {
        addUsage(window, point.usage);
        if (oldestInWindow === null || point.at < oldestInWindow) oldestInWindow = point.at;
        const bucket = byModel.get(point.model) || emptyBucket();
        addUsage(bucket, point.usage);
        byModel.set(point.model, bucket);
      }
    }
  }

  const total = emptyBucket();
  for (const entry of files) {
    for (const point of readPoints(entry)) addUsage(total, point.usage);
  }

  return {
    windowMs: WINDOW_MS,
    window,
    today,
    total,
    byModel: [...byModel.entries()]
      .map(([model, bucket]) => ({ model, ...bucket }))
      .sort((a, b) => b.output - a.output),
    /** Instant où la plus ancienne consommation sortira de la fenêtre. */
    windowResetsAt: oldestInWindow === null ? null : oldestInWindow + WINDOW_MS,
    lastActivity,
    files: files.length,
    truncated,
    computedAt: now,
  };
}

/* --------------------------------------------------------------------- */
/* Codex                                                                  */
/* --------------------------------------------------------------------- */

const CODEX_DIR = path.join(os.homedir(), ".codex");
/** Dossiers à ignorer : plugins et fichiers temporaires, sans consommation. */
const CODEX_SKIP = new Set([".tmp", "plugins", "skills", "memories", "node_modules"]);

/** Recherche bornée des transcriptions Codex exploitables. */
function findCodexTranscripts(dir, depth, found) {
  if (depth > 3 || found.length >= 40) return found;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (found.length >= 40) break;
    if (entry.isDirectory()) {
      if (CODEX_SKIP.has(entry.name)) continue;
      findCodexTranscripts(path.join(dir, entry.name), depth + 1, found);
    } else if (entry.name.endsWith(".jsonl")) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

/**
 * Consommation Codex.
 *
 * Codex enregistre l'essentiel de son historique dans une base SQLite, que nous
 * ne lisons pas : cela imposerait un module natif, donc une compilation par
 * plateforme, pour une fonction secondaire. Seules les transcriptions au format
 * JSONL sont exploitées. Quand il n'y en a pas, on le dit plutôt que d'afficher
 * un zéro trompeur.
 */
function computeCodex(now = Date.now()) {
  if (!fs.existsSync(CODEX_DIR)) return { available: false, reason: "Codex n'est pas installé." };

  const files = findCodexTranscripts(CODEX_DIR, 0, []);
  if (files.length === 0) {
    return { available: false, reason: "La consommation Codex n'est pas mesurable ici." };
  }

  const total = emptyBucket();
  const window = emptyBucket();
  const windowFrom = now - WINDOW_MS;
  let seen = 0;

  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (stat.size > 8 * 1024 * 1024) continue;

    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const line of raw.split("\n")) {
      if (!line || line.indexOf('"usage"') === -1) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const usage = record.usage || record.payload?.usage;
      if (!usage || typeof usage.input_tokens !== "number") continue;

      const normalized = {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: usage.input_token_details?.cached_tokens ?? 0,
      };
      addUsage(total, normalized);
      seen += 1;

      const at = Date.parse(record.timestamp || record.metadata?.timestamp || "");
      if (Number.isFinite(at) && at >= windowFrom) addUsage(window, normalized);
    }
  }

  if (seen === 0) {
    return { available: false, reason: "Aucune consommation Codex lisible dans les transcriptions." };
  }
  return { available: true, total, window, files: files.length };
}

module.exports = { compute, computeCodex, WINDOW_MS };
