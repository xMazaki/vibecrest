"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Installation de l'extension compagnon dans VS Code et ses dérivés.
 *
 * L'extension est déposée directement dans le dossier des extensions plutôt que
 * packagée en vsix : cela évite une dépendance à vsce et à l'exécutable de
 * l'éditeur, et le résultat est le même puisque VS Code inspecte ce dossier au
 * démarrage.
 */

/**
 * Éditeurs reconnus. `dir` est le dossier d'extensions dans le profil,
 * `scheme` le protocole d'URI, `exe` le nom de processus déjà utilisé par la
 * détection d'hôte.
 */
const EDITORS = [
  { kind: "vscode", label: "VS Code", dir: ".vscode", scheme: "vscode", exe: "Code" },
  {
    kind: "vscode-insiders",
    label: "VS Code Insiders",
    dir: ".vscode-insiders",
    scheme: "vscode-insiders",
    exe: "Code - Insiders",
  },
  { kind: "cursor", label: "Cursor", dir: ".cursor", scheme: "cursor", exe: "Cursor" },
  { kind: "windsurf", label: "Windsurf", dir: ".windsurf", scheme: "windsurf", exe: "Windsurf" },
  { kind: "vscodium", label: "VSCodium", dir: ".vscode-oss", scheme: "vscodium", exe: "VSCodium" },
];

const PUBLISHER = "vibecrest";
const NAME = "terminal-focus";
const VERSION = "0.1.0";
const FOLDER = `${PUBLISHER}.${NAME}-${VERSION}`;

/** Identité d'URI de l'extension, telle que VS Code l'attend. */
const URI_AUTHORITY = `${PUBLISHER}.${NAME}`;

function extensionsDir(editor) {
  return path.join(os.homedir(), editor.dir, "extensions");
}

function targetDir(editor) {
  return path.join(extensionsDir(editor), FOLDER);
}

function editorFor(hostKind) {
  return EDITORS.find((editor) => editor.kind === hostKind) || null;
}

/** Éditeurs présents sur la machine, c'est à dire dont le profil existe. */
function detectEditors() {
  return EDITORS.filter((editor) => fs.existsSync(extensionsDir(editor))).map((editor) => ({
    ...editor,
    installed: fs.existsSync(path.join(targetDir(editor), "package.json")),
  }));
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, destination);
    else fs.copyFileSync(source, destination);
  }
}

/** Installe ou met à jour l'extension dans tous les éditeurs détectés. */
function install(sourceDir) {
  const results = [];
  for (const editor of detectEditors()) {
    try {
      const destination = targetDir(editor);
      fs.rmSync(destination, { recursive: true, force: true });
      copyTree(sourceDir, destination);
      results.push({ editor: editor.label, ok: true });
    } catch (err) {
      results.push({ editor: editor.label, ok: false, error: err.message });
    }
  }
  return results;
}

function uninstall() {
  const results = [];
  for (const editor of detectEditors()) {
    try {
      fs.rmSync(targetDir(editor), { recursive: true, force: true });
      results.push({ editor: editor.label, ok: true });
    } catch (err) {
      results.push({ editor: editor.label, ok: false, error: err.message });
    }
  }
  return results;
}

function status() {
  const editors = detectEditors();
  return {
    editors: editors.map(({ kind, label, installed }) => ({ kind, label, installed })),
    anyInstalled: editors.some((editor) => editor.installed),
  };
}

/**
 * URI à ouvrir pour qu'un éditeur donne le focus au bon terminal.
 * Retourne null si l'hôte n'est pas un éditeur connu ou si l'extension n'y est
 * pas installée, auquel cas on s'en tient à l'activation de la fenêtre.
 */
function focusUri(hostKind, pids) {
  const editor = editorFor(hostKind);
  if (!editor) return null;
  if (!fs.existsSync(path.join(targetDir(editor), "package.json"))) return null;
  const list = (Array.isArray(pids) ? pids : []).filter((value) => Number.isInteger(value));
  if (list.length === 0) return null;
  return `${editor.scheme}://${URI_AUTHORITY}/focus?pids=${list.join(",")}`;
}

module.exports = { install, uninstall, status, focusUri, EDITORS, FOLDER, URI_AUTHORITY };
