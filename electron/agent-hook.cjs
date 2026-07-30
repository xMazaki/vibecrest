#!/usr/bin/env node
"use strict";

/**
 * Hook Vibe Crest exécuté par Claude Code à chaque événement.
 *
 * Contrat, dans les deux sens :
 *   entrée  : la charge utile JSON du hook arrive sur stdin
 *   sortie  : pour PreToolUse, un objet hookSpecificOutput sur stdout décide de l'autorisation
 *
 * Règle de sûreté absolue : ce script ne doit jamais casser une session Claude Code.
 * Toute erreur, tout timeout, toute app absente se traduit par une sortie vide et un
 * code de retour 0, ce qui rend la main au comportement natif de Claude Code.
 */

const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PIPE_NAME = "\\\\.\\pipe\\vibe-crest";
const CONFIG_FILE = path.join(os.homedir(), ".vibecrest", "config.json");

const DEFAULT_GATED = ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit", "WebFetch"];
const DEFAULT_TIMEOUT_MS = 240000;
/** Au delà, on considère que l'app n'écoute pas et on rend la main tout de suite. */
const CONNECT_TIMEOUT_MS = 700;

function readConfig() {
  try {
    let raw = fs.readFileSync(CONFIG_FILE, "utf8");
    // Marque d'ordre des octets, courante sur les fichiers écrits sous Windows.
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let buf = "";
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve(buf);
      }
    };
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", done);
    process.stdin.on("error", done);
    // Garde-fou, si stdin ne se ferme jamais on ne reste pas suspendu.
    setTimeout(done, 2000).unref();
  });
}

/**
 * Envoie l'événement sur le named pipe.
 * Si awaitReply vaut false on n'attend rien, l'app reçoit et ferme.
 * Si awaitReply vaut true on garde la socket ouverte jusqu'à la décision.
 */
function send(event, awaitReply, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* la socket est déjà fermée */
      }
      resolve(value);
    };

    const socket = net.createConnection(PIPE_NAME);
    socket.setEncoding("utf8");

    // L'app n'est pas lancée, on ne bloque pas Claude Code pour autant.
    const connectTimer = setTimeout(() => finish(null), CONNECT_TIMEOUT_MS);

    socket.on("connect", () => {
      clearTimeout(connectTimer);
      socket.write(JSON.stringify(event));
      if (!awaitReply) {
        socket.end();
        finish(null);
        return;
      }
      socket.setTimeout(timeoutMs, () => finish(null));
    });

    let reply = "";
    socket.on("data", (chunk) => {
      reply += chunk;
      try {
        const parsed = JSON.parse(reply);
        finish(parsed);
      } catch {
        /* réponse encore incomplète, on continue d'accumuler */
      }
    });

    socket.on("end", () => finish(safeParse(reply)));

    /*
     * Filet indispensable sur un named pipe Windows.
     *
     * Contrairement à une socket TCP, un pipe ne pratique pas la demi-fermeture :
     * quand le serveur ferme sans avoir rien écrit, le client peut recevoir
     * « close » sans « end ». Sans ce gestionnaire, la promesse ne se résolvait
     * jamais et le hook restait suspendu jusqu'au délai maximal, ce qui donnait
     * l'impression qu'une question renvoyée au terminal disparaissait sans
     * jamais y réapparaître.
     */
    socket.on("close", () => finish(safeParse(reply)));

    socket.on("error", () => {
      clearTimeout(connectTimer);
      finish(null);
    });
  });
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Empreinte de l'hôte du terminal, lue dans l'environnement de la session.
 *
 * C'est la méthode fiable pour savoir où tourne l'agent : chaque terminal
 * plante ses propres variables, et le hook s'exécute à l'intérieur de la
 * session, donc il les voit toutes. Remonter la chaîne des processus donne la
 * même information mais plus tard et plus cher.
 *
 * On ne remonte que des marqueurs d'identification, jamais le contenu de
 * l'environnement, qui contient des jetons.
 */
function terminalHint() {
  const env = process.env;
  const get = (key) => (typeof env[key] === "string" && env[key] ? env[key] : undefined);
  const flag = (key) => (get(key) ? "1" : undefined);

  return {
    termProgram: get("TERM_PROGRAM"),
    // VS Code et ses dérivés injectent ces variables dans le terminal intégré.
    vscodeInjection: flag("VSCODE_INJECTION"),
    vscodeCli: flag("VSCODE_IPC_HOOK_CLI"),
    // Le chemin de l'askpass révèle lequel des dérivés est l'hôte.
    askpass: get("VSCODE_GIT_ASKPASS_MAIN") || get("GIT_ASKPASS"),
    wtSession: flag("WT_SESSION"),
    conemu: flag("ConEmuPID"),
    wezterm: flag("WEZTERM_PANE"),
    alacritty: flag("ALACRITTY_WINDOW_ID"),
    tmux: flag("TMUX"),
  };
}

function isGated(toolName, gated) {
  if (!toolName) return false;
  if (gated.includes(toolName)) return true;
  // Les outils MCP portent un nom préfixé, on les traite comme un groupe.
  return toolName.startsWith("mcp__") && gated.includes("mcp__*");
}

/**
 * Événement Codex CLI.
 *
 * Codex n'expose qu'un seul point d'accroche, `notify`, et un seul événement,
 * `agent-turn-complete`. La charge utile arrive en argument de la commande et
 * non sur l'entrée standard. Il n'y a donc ni approbation ni journal d'outils
 * possible : on remonte la fin de tour, et rien d'autre.
 */
async function runCodex() {
  const payload = process.argv.slice(2).map(safeParse).find((value) => value && value.type);
  if (!payload || payload.type !== "agent-turn-complete") return;

  const threadId = payload["thread-id"] || payload.thread_id || "";
  if (!threadId) return;

  const inputs = Array.isArray(payload["input-messages"]) ? payload["input-messages"] : [];

  await send(
    {
      protocol: 1,
      agent: "codex",
      event: "Stop",
      sessionId: `codex:${threadId}`,
      cwd: payload.cwd || "",
      toolName: null,
      toolInput: null,
      prompt: inputs.length ? String(inputs[inputs.length - 1]) : null,
      message: payload["last-assistant-message"] || null,
      ppid: process.ppid,
      terminal: terminalHint(),
      isQuestion: false,
      needsDecision: false,
      at: Date.now(),
    },
    false,
    DEFAULT_TIMEOUT_MS
  );
}

async function main() {
  if (process.argv.includes("--codex")) return runCodex();

  const raw = await readStdin();
  const payload = safeParse(raw) || {};

  const eventName = payload.hook_event_name || "";
  const sessionId = payload.session_id || "";
  if (!eventName || !sessionId) return;

  const config = readConfig();
  const gated = Array.isArray(config.gatedTools) ? config.gatedTools : DEFAULT_GATED;
  const timeoutMs = Number(config.decisionTimeoutMs) || DEFAULT_TIMEOUT_MS;

  const toolName = payload.tool_name || "";
  const isQuestion = toolName === "AskUserQuestion";

  // Une question suspend l'outil au même titre qu'une autorisation : c'est ce
  // qui permet d'y répondre depuis le pill. Sans réponse, on rend la main et
  // Claude Code affiche sa propre interface de question dans le terminal.
  const needsDecision =
    eventName === "PreToolUse" &&
    !config.autoMode &&
    (isQuestion || isGated(toolName, gated));

  const event = {
    protocol: 1,
    agent: "claude",
    event: eventName,
    sessionId,
    cwd: payload.cwd || process.cwd(),
    toolName: toolName || null,
    toolInput: payload.tool_input || null,
    prompt: payload.prompt || null,
    message: payload.message || null,
    // Le PID parent sert à retrouver la fenêtre du terminal pour le retour arrière.
    ppid: process.ppid,
    terminal: terminalHint(),
    isQuestion,
    needsDecision,
    at: Date.now(),
  };

  const reply = await send(event, needsDecision, timeoutMs);

  // Sans décision explicite on n'écrit rien : Claude Code reprend son flux
  // normal, invite du terminal comprise.
  if (!needsDecision || !reply || !reply.decision) return;

  /*
   * Réponse à une question posée par l'agent.
   *
   * Le contrat de hook n'offre pas de canal pour fournir le résultat d'un
   * AskUserQuestion. On passe donc par le refus, dont le motif est transmis au
   * modèle : l'outil n'est pas exécuté, et la réponse arrive sous forme de
   * texte explicite. C'est un détournement assumé, mais il est sans risque et
   * il rend la réponse depuis le pill réellement utilisable.
   */
  if (reply.decision === "answer") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            reply.reason || "L'utilisateur a répondu depuis Vibe Crest.",
        },
      })
    );
    return;
  }

  const decision = reply.decision === "deny" ? "deny" : "allow";
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reply.reason || "Décision prise depuis Vibe Crest",
      },
    })
  );
}

main()
  .catch(() => {
    /* silence volontaire, voir la règle de sûreté en tête de fichier */
  })
  .finally(() => process.exit(0));
