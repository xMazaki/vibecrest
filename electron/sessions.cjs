"use strict";

const path = require("path");
const { EventEmitter } = require("events");
const preview = require("./preview.cjs");

/** Nombre d'entrées de journal conservées par session. */
const MAX_ACTIVITY = 60;

/**
 * Machine à états des sessions Claude Code.
 *
 * Statuts :
 *   working    l'agent travaille
 *   attention  une décision d'autorisation est suspendue sur le pill
 *   question   l'agent pose une question, la réponse se donne au terminal
 *   waiting    l'agent réclame l'utilisateur sans attendre de décision
 *   idle       tour terminé
 *
 * Chaque session porte aussi un journal d'activité borné, qui alimente
 * l'affichage temps réel du panneau déployé.
 */
class SessionStore extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.sessions = new Map();
    this.timers = new Map();
    /** Compteur d'identifiants d'entrées de journal. */
    this.sequence = 0;
  }

  setConfig(config) {
    this.config = config;
  }

  list() {
    return [...this.sessions.values()].sort((a, b) => {
      const rank = (s) =>
        s.status === "attention" || s.status === "question"
          ? 0
          : s.status === "waiting"
            ? 1
            : s.status === "working"
              ? 2
              : 3;
      const diff = rank(a) - rank(b);
      return diff !== 0 ? diff : b.updatedAt - a.updatedAt;
    });
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  #touch(event) {
    const existing = this.sessions.get(event.sessionId);
    const cwd = event.cwd || existing?.cwd || "";
    const session = existing || {
      id: event.sessionId,
      agent: event.agent || "claude",
      startedAt: event.at || Date.now(),
      turnStartedAt: event.at || Date.now(),
      prompt: null,
      tool: null,
      message: null,
      pending: null,
      question: null,
      activity: [],
      toolCount: 0,
      /** Sous-agents actuellement en cours. */
      subagents: 0,
      /** Outils que vous avez choisi de ne plus voir passer sur cette session. */
      allowRules: [],
    };
    session.cwd = cwd;
    session.label = cwd ? path.basename(cwd) : "session";
    session.ppid = event.ppid || session.ppid || null;
    if (event.terminal) session.host = classifyHost(event.terminal);
    if (!session.host) session.host = classifyHost(null);
    session.updatedAt = event.at || Date.now();
    this.sessions.set(session.id, session);
    this.#cancelDismiss(session.id);
    return session;
  }

  #cancelDismiss(id) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /**
   * Retrait différé après la fin d'un tour.
   *
   * Un délai nul, qui est le réglage par défaut, désactive le retrait. Le hook
   * Stop de Claude Code signale la fin d'un tour, pas la fin de la session :
   * faire disparaître la session à ce moment la fait réapparaître au message
   * suivant, ce qui donne l'impression que le suivi perd le fil. Seul
   * SessionEnd, ou un retrait manuel, fait sortir une session du pill.
   */
  #scheduleDismiss(id) {
    this.#cancelDismiss(id);
    const delay = Number(this.config.dismissAfterMs) || 0;
    if (delay <= 0) return;
    const timer = setTimeout(() => {
      this.timers.delete(id);
      const session = this.sessions.get(id);
      // On ne retire jamais une session qui réclame encore quelque chose.
      if (session && session.status === "idle") {
        this.sessions.delete(id);
        this.emit("changed");
      }
    }, delay);
    timer.unref?.();
    this.timers.set(id, timer);
  }

  /**
   * Ajoute une entrée au journal.
   *
   * Chaque entrée porte un identifiant stable : c'est ce qui permet au rendu
   * d'animer les arrivées et les départs. Une clé dérivée de l'horodatage et de
   * la position se briserait au premier défilement du tampon.
   */
  #log(session, entry) {
    session.activity.push({ id: `a${++this.sequence}`, at: Date.now(), ...entry });
    if (session.activity.length > MAX_ACTIVITY) session.activity.shift();
  }

  /** Clôt la dernière entrée d'outil encore ouverte portant ce nom. */
  #closeTool(session, toolName) {
    for (let i = session.activity.length - 1; i >= 0; i--) {
      const entry = session.activity[i];
      if (
        (entry.kind === "tool" || entry.kind === "subagent") &&
        entry.tool === toolName &&
        entry.state !== "done"
      ) {
        entry.state = "done";
        entry.tookMs = Date.now() - entry.at;
        return entry;
      }
    }
    return null;
  }

  /**
   * Clôt le sous-agent ouvert le plus ancien.
   *
   * Claude Code n'associe pas SubagentStop à un Task précis. Avec plusieurs
   * sous-agents lancés en parallèle, on clôt donc dans l'ordre d'ouverture,
   * ce qui est le rapprochement le plus probable à défaut de mieux.
   */
  #closeSubagent(session) {
    for (const entry of session.activity) {
      if (entry.kind === "subagent" && entry.state !== "done") {
        entry.state = "done";
        entry.tookMs = Date.now() - entry.at;
        return entry;
      }
    }
    return null;
  }

  /**
   * Applique un événement de hook.
   * requestId n'est fourni que pour les événements qui suspendent l'outil.
   */
  apply(event, requestId, opts) {
    const session = this.#touch(event);
    const auto = Boolean(opts?.auto);

    switch (event.event) {
      case "SessionStart":
        session.status = "working";
        this.#log(session, { kind: "session", text: "session ouverte" });
        break;

      case "UserPromptSubmit":
        session.status = "working";
        session.prompt = event.prompt || session.prompt;
        session.message = null;
        session.turnStartedAt = Date.now();
        if (event.prompt) this.#log(session, { kind: "prompt", text: event.prompt });
        break;

      case "PreToolUse": {
        const detail = preview.summarize(event.toolName, event.toolInput);
        const isSubagent = event.toolName === "Task";

        if (event.isQuestion) {
          session.status = "question";
          // requestId peut manquer si le mode auto est actif : la question part
          // alors au terminal, et le pill se contente de l'afficher.
          session.question = { requestId: requestId || null, blocks: normalizeQuestions(event.toolInput) };
          this.#log(session, { kind: "notice", text: "question posée" });
        } else if (requestId) {
          session.status = "attention";
          session.pending = {
            requestId,
            toolName: event.toolName,
            summary: detail,
            // Sert à faire monter l'insistance visuelle si personne ne répond.
            since: Date.now(),
            // L'aperçu est ce qui permet d'approuver une action plutôt qu'un
            // simple nom de fichier.
            preview: preview.build(event.toolName, event.toolInput),
          };
          session.toolCount += 1;
          this.#log(session, {
            kind: isSubagent ? "subagent" : "tool",
            tool: event.toolName,
            detail,
            state: "pending",
          });
        } else {
          session.status = "working";
          session.tool = event.toolName;
          session.toolCount += 1;
          if (isSubagent) session.subagents += 1;
          this.#log(session, {
            kind: isSubagent ? "subagent" : "tool",
            tool: event.toolName,
            detail,
            state: "running",
            // Marque les appels passés grâce à une règle de session, pour que
            // le journal reste honnête sur ce qui a été validé et comment.
            outcome: auto ? "règle" : undefined,
          });
        }
        break;
      }

      case "PostToolUse":
        // Un Task ne se clôt pas ici : son entrée reste ouverte jusqu'à
        // SubagentStop, qui marque la vraie fin du sous-agent.
        if (event.toolName !== "Task") this.#closeTool(session, event.toolName);
        if (session.status !== "attention" && session.status !== "question") {
          session.status = "working";
        }
        session.tool = null;
        break;

      case "SubagentStop": {
        const closed = this.#closeSubagent(session);
        if (closed && session.subagents > 0) session.subagents -= 1;
        break;
      }

      case "Notification":
        session.status = "waiting";
        session.message = event.message || "Claude Code attend une action";
        this.#log(session, { kind: "notice", text: session.message });
        break;

      case "Stop":
        session.status = "idle";
        session.tool = null;
        session.pending = null;
        session.question = null;
        // Codex ne transmet qu'un événement de fin de tour, accompagné du
        // dernier message de l'assistant : c'est la seule matière disponible.
        this.#log(session, { kind: "stop", text: event.message || "tour terminé" });
        if (event.message) session.message = event.message;
        this.#scheduleDismiss(session.id);
        break;

      case "SessionEnd":
        this.#cancelDismiss(session.id);
        this.sessions.delete(session.id);
        this.emit("changed");
        return null;

      default:
        break;
    }

    this.emit("changed");
    return session;
  }

  /**
   * Règles de session : équivalent local du "ne plus demander" de Claude Code.
   * Elles ne sont pas persistées, elles disparaissent avec la session, ce qui
   * est le comportement attendu d'une autorisation donnée dans un contexte.
   */
  isAutoAllowed(sessionId, toolName) {
    const session = this.sessions.get(sessionId);
    return Boolean(toolName && session?.allowRules?.includes(toolName));
  }

  addRule(sessionId, toolName) {
    const session = this.sessions.get(sessionId);
    if (!session || !toolName) return false;
    if (!session.allowRules.includes(toolName)) {
      session.allowRules.push(toolName);
      this.emit("changed");
    }
    return true;
  }

  clearRules(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.allowRules.length === 0) return false;
    session.allowRules = [];
    this.emit("changed");
    return true;
  }

  /** Solde une décision d'autorisation et remet la session au travail. */
  clearPending(requestId, outcome) {
    for (const session of this.sessions.values()) {
      if (session.pending?.requestId === requestId) {
        const entry = this.#closeTool(session, session.pending.toolName);
        if (entry) entry.outcome = outcome || "expiré";
        session.pending = null;
        session.status = "working";
        session.updatedAt = Date.now();
        this.emit("changed");
        return session;
      }
    }
    return null;
  }

  /** Solde une question, qu'elle ait reçu une réponse ou été renvoyée au terminal. */
  clearQuestion(requestId, outcome) {
    for (const session of this.sessions.values()) {
      if (session.question?.requestId && session.question.requestId === requestId) {
        session.question = null;
        session.status = "working";
        session.updatedAt = Date.now();
        this.#log(session, { kind: "notice", text: outcome || "question soldée" });
        this.emit("changed");
        return session;
      }
    }
    return null;
  }

  dismiss(id) {
    this.#cancelDismiss(id);
    if (this.sessions.delete(id)) this.emit("changed");
  }
}

/**
 * Identifie l'hôte du terminal à partir de l'empreinte d'environnement.
 *
 * exe est le nom de processus à privilégier lors de la remontée de la chaîne
 * des parents. Sans cette préférence on active la première fenêtre trouvée,
 * qui peut être un hôte de pseudo-terminal plutôt que l'éditeur lui-même.
 */
function classifyHost(hint) {
  if (!hint || typeof hint !== "object") return { kind: "unknown", label: "hôte inconnu", exe: null };

  const askpass = String(hint.askpass || "").toLowerCase();
  const isEditor = hint.termProgram === "vscode" || hint.vscodeInjection || hint.vscodeCli;

  if (isEditor) {
    if (askpass.includes("cursor")) return { kind: "cursor", label: "Cursor", exe: "Cursor" };
    if (askpass.includes("windsurf")) return { kind: "windsurf", label: "Windsurf", exe: "Windsurf" };
    if (askpass.includes("vscodium")) return { kind: "vscodium", label: "VSCodium", exe: "VSCodium" };
    if (askpass.includes("code - insiders")) {
      return { kind: "vscode-insiders", label: "VS Code Insiders", exe: "Code - Insiders" };
    }
    return { kind: "vscode", label: "VS Code", exe: "Code" };
  }

  if (hint.wtSession) {
    return { kind: "windows-terminal", label: "Windows Terminal", exe: "WindowsTerminal" };
  }
  if (hint.wezterm) return { kind: "wezterm", label: "WezTerm", exe: "wezterm-gui" };
  if (hint.alacritty) return { kind: "alacritty", label: "Alacritty", exe: "alacritty" };
  if (hint.conemu) return { kind: "conemu", label: "ConEmu", exe: "ConEmu64" };
  if (hint.termProgram) return { kind: "other", label: hint.termProgram, exe: null };
  return { kind: "unknown", label: "hôte inconnu", exe: null };
}

/**
 * Normalise les questions d'un AskUserQuestion.
 *
 * On conserve `multiSelect`, sans quoi une question à réponses multiples serait
 * présentée comme un choix unique, et la description de chaque option, qui est
 * souvent ce qui permet de trancher. L'option « Autre » n'est jamais dans la
 * charge utile : elle est ajoutée par l'interface, ici comme dans le terminal.
 */
function normalizeQuestions(toolInput) {
  const raw = toolInput?.questions;
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 4).map((q) => ({
    header: typeof q?.header === "string" ? q.header : "",
    question: typeof q?.question === "string" ? q.question : "",
    multiSelect: q?.multiSelect === true,
    options: Array.isArray(q?.options)
      ? q.options.slice(0, 8).map((o) => ({
          label: typeof o?.label === "string" ? o.label : String(o ?? ""),
          description: typeof o?.description === "string" ? o.description : "",
        }))
      : [],
  }));
}

module.exports = { SessionStore };
