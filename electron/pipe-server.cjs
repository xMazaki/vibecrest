"use strict";

const net = require("net");
const { EventEmitter } = require("events");
const { PIPE_NAME } = require("./paths.cjs");

/**
 * Serveur de named pipe qui reçoit les événements des hooks.
 *
 * Pour un événement qui attend une décision, la socket reste ouverte : le
 * processus de hook, et donc l'outil que Claude Code s'apprête à lancer, sont
 * suspendus jusqu'à ce que l'interface réponde ou que le délai expire.
 */
class PipeServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    /** requestId vers la socket en attente et son minuteur. */
    this.pending = new Map();
    this.nextId = 1;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.#onConnection(socket));
      this.server.on("error", (err) => {
        if (!this.server.listening) reject(err);
        else this.emit("error", err);
      });
      this.server.listen(PIPE_NAME, () => resolve(PIPE_NAME));
    });
  }

  stop() {
    for (const [id] of this.pending) this.resolve(id, null);
    if (this.server) this.server.close();
    this.server = null;
  }

  #onConnection(socket) {
    socket.setEncoding("utf8");
    let buffer = "";
    let handled = false;

    socket.on("data", (chunk) => {
      if (handled) return;
      buffer += chunk;
      let event;
      try {
        event = JSON.parse(buffer);
      } catch {
        // Message encore incomplet, on attend la suite.
        if (buffer.length > 1024 * 1024) socket.destroy();
        return;
      }
      handled = true;
      this.#dispatch(event, socket);
    });

    socket.on("error", () => socket.destroy());
  }

  #dispatch(event, socket) {
    if (!event || typeof event !== "object" || !event.sessionId) {
      socket.end();
      return;
    }

    if (!event.needsDecision) {
      this.emit("event", event, null);
      socket.end();
      return;
    }

    const requestId = `req-${this.nextId++}`;
    const timeoutMs = Number(event.timeoutMs) || 240000;

    if (process.env.VIBE_CREST_TRACE) {
      console.error(`[trace] dispatch bloquant ${requestId} tool=${event.toolName} timeout=${timeoutMs}`);
    }

    const timer = setTimeout(() => this.resolve(requestId, null), timeoutMs);
    this.pending.set(requestId, { socket, timer, event });

    socket.on("close", () => {
      const record = this.pending.get(requestId);
      if (record) {
        clearTimeout(record.timer);
        this.pending.delete(requestId);
        this.emit("abandoned", requestId, event);
      }
    });

    this.emit("event", event, requestId);
  }

  /** Répond au hook en attente. Passer null laisse Claude Code reprendre son flux natif. */
  resolve(requestId, decision, reason, extra) {
    if (process.env.VIBE_CREST_TRACE) {
      console.error(
        `[trace] resolve(${requestId}, ${decision}) appele depuis:\n` +
          new Error("pile").stack.split("\n").slice(1, 6).join("\n")
      );
    }
    const record = this.pending.get(requestId);
    if (!record) return false;
    clearTimeout(record.timer);
    this.pending.delete(requestId);
    try {
      if (decision) {
        record.socket.end(JSON.stringify({ decision, reason: reason || null, ...(extra || {}) }));
      } else {
        record.socket.end();
      }
    } catch {
      /* le hook a déjà abandonné */
    }
    return true;
  }

  hasPending(requestId) {
    return this.pending.has(requestId);
  }
}

module.exports = { PipeServer, PIPE_NAME };
