"use strict";

const path = require("path");

/**
 * Construction de l'aperçu présenté avant une approbation.
 *
 * Le principe : ne jamais demander de valider une action sans montrer ce
 * qu'elle fait. La charge utile du hook contient tout le nécessaire, un
 * `old_string` et un `new_string` pour une modification, le contenu complet
 * pour une écriture, le plan pour une sortie de mode plan. S'en tenir au chemin
 * du fichier revient à faire approuver une intention plutôt qu'une action.
 */

/** Au delà, on renonce au calcul de différence et on montre les deux blocs. */
const MAX_DIFF_LINES = 400;
/** Lignes de contexte conservées autour de chaque changement. */
const CONTEXT_LINES = 3;
/** Longueur maximale d'un bloc de texte transmis au rendu. */
const MAX_TEXT = 8000;

function clip(text, limit = MAX_TEXT) {
  const value = String(text ?? "");
  if (value.length <= limit) return { text: value, clipped: 0 };
  const cut = value.slice(0, limit);
  const remaining = value.slice(limit).split("\n").length;
  return { text: cut, clipped: remaining };
}

/** Ne garde que les deux derniers segments d'un chemin, suffisant pour situer. */
function shortPath(filePath) {
  const parts = String(filePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length <= 2 ? parts.join("/") : parts.slice(-2).join("/");
}

/**
 * Différence ligne à ligne par plus longue sous-séquence commune.
 *
 * Les portions modifiées d'un Edit sont courtes en pratique, la complexité
 * quadratique n'est donc pas un problème ; la borne MAX_DIFF_LINES protège
 * malgré tout des cas dégénérés.
 */
function lineDiff(oldText, newText) {
  const a = String(oldText ?? "").split("\n");
  const b = String(newText ?? "").split("\n");
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return null;

  const m = a.length;
  const n = b.length;
  const table = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      rows.push({ sign: " ", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ sign: "-", text: a[i] });
      i++;
    } else {
      rows.push({ sign: "+", text: b[j] });
      j++;
    }
  }
  while (i < m) rows.push({ sign: "-", text: a[i++] });
  while (j < n) rows.push({ sign: "+", text: b[j++] });
  return rows;
}

/**
 * Réduit les longues plages inchangées à quelques lignes de contexte.
 * Une modification de trois lignes dans un fichier de deux cents doit se lire
 * d'un coup d'œil, pas se chercher.
 */
function collapse(rows) {
  if (!rows) return null;
  const keep = new Array(rows.length).fill(false);
  rows.forEach((row, index) => {
    if (row.sign === " ") return;
    for (let k = index - CONTEXT_LINES; k <= index + CONTEXT_LINES; k++) {
      if (k >= 0 && k < rows.length) keep[k] = true;
    }
  });

  const out = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    if (keep[index]) {
      if (skipped > 0) {
        out.push({ sign: "~", text: `${skipped} ligne${skipped > 1 ? "s" : ""} inchangée${skipped > 1 ? "s" : ""}` });
        skipped = 0;
      }
      out.push(row);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) {
    out.push({ sign: "~", text: `${skipped} ligne${skipped > 1 ? "s" : ""} inchangée${skipped > 1 ? "s" : ""}` });
  }
  return out;
}

function diffPreview(filePath, oldText, newText) {
  const rows = collapse(lineDiff(oldText, newText));
  if (!rows) {
    // Trop volumineux pour une comparaison : on montre au moins la cible et la
    // taille en jeu plutôt que de mentir par omission.
    const before = String(oldText ?? "").split("\n").length;
    const after = String(newText ?? "").split("\n").length;
    return {
      kind: "note",
      title: shortPath(filePath),
      body: `Modification trop volumineuse pour être comparée ici : ${before} lignes remplacées par ${after}.`,
    };
  }
  const added = rows.filter((r) => r.sign === "+").length;
  const removed = rows.filter((r) => r.sign === "-").length;
  return { kind: "diff", title: shortPath(filePath), rows: rows.slice(0, 300), added, removed };
}

/** Construit l'aperçu correspondant à un appel d'outil. */
function build(toolName, input) {
  if (!input || typeof input !== "object") {
    return { kind: "plain", title: toolName || "", body: "" };
  }

  switch (toolName) {
    case "Bash":
    case "PowerShell": {
      const { text, clipped } = clip(input.command);
      return {
        kind: "command",
        title: input.description ? String(input.description) : "",
        body: text,
        clipped,
        shell: toolName === "PowerShell" ? "PowerShell" : "Bash",
      };
    }

    case "Edit": {
      return diffPreview(input.file_path, input.old_string, input.new_string);
    }

    case "MultiEdit": {
      const edits = Array.isArray(input.edits) ? input.edits : [];
      const parts = edits
        .slice(0, 6)
        .map((edit) => diffPreview(input.file_path, edit.old_string, edit.new_string));
      return {
        kind: "multi",
        title: shortPath(input.file_path),
        count: edits.length,
        parts,
      };
    }

    case "Write": {
      const { text, clipped } = clip(input.content);
      return {
        kind: "text",
        title: shortPath(input.file_path),
        body: text,
        clipped,
        language: path.extname(String(input.file_path || "")).replace(".", ""),
      };
    }

    case "NotebookEdit": {
      const { text, clipped } = clip(input.new_source);
      return { kind: "text", title: shortPath(input.notebook_path), body: text, clipped };
    }

    case "ExitPlanMode": {
      const { text, clipped } = clip(input.plan, 12000);
      return { kind: "markdown", title: "Plan proposé", body: text, clipped };
    }

    case "WebFetch": {
      return { kind: "plain", title: String(input.url || ""), body: String(input.prompt || "") };
    }

    case "WebSearch": {
      return { kind: "plain", title: "Recherche web", body: String(input.query || "") };
    }

    case "Task": {
      return {
        kind: "plain",
        title: String(input.description || "Sous-agent"),
        body: String(input.prompt || "").slice(0, 1200),
      };
    }

    default: {
      // Outils MCP et inconnus : on rend la charge utile lisible plutôt que de
      // se rabattre sur le nom de l'outil seul.
      const { text, clipped } = clip(JSON.stringify(input, null, 2), 4000);
      return { kind: "text", title: toolName || "", body: text, clipped };
    }
  }
}

/** Résumé d'une ligne, pour le journal et la vue compacte. */
function summarize(toolName, input) {
  if (!input || typeof input !== "object") return toolName || "";
  switch (toolName) {
    case "Bash":
    case "PowerShell":
      return String(input.command || "").slice(0, 400);
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
      return shortPath(input.file_path);
    case "NotebookEdit":
      return shortPath(input.notebook_path);
    case "Glob":
    case "Grep":
      return String(input.pattern || "");
    case "WebFetch":
      return String(input.url || "");
    case "WebSearch":
      return String(input.query || "");
    case "ExitPlanMode":
      return "validation du plan";
    case "Task":
      return String(input.description || "sous-agent");
    case "TodoWrite":
      return Array.isArray(input.todos) ? `${input.todos.length} tâches` : "";
    default: {
      const first = Object.values(input).find((value) => typeof value === "string");
      return first ? String(first).slice(0, 240) : "";
    }
  }
}

module.exports = { build, summarize, shortPath };
