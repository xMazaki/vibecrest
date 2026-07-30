import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCrest, focusedSession, needsUser, pendingCount } from "../store";
import type { Answer, Session } from "../types";
import { cue } from "../sound";
import { useTick, formatDuration } from "../useTick";
import { PermissionCard } from "./PermissionCard";
import { QuestionCard } from "./QuestionCard";
import { ActivityFeed } from "./ActivityFeed";
import { StatusDot } from "./StatusDot";
import { IconClose, IconCollapse, IconGauge, IconJump, IconSliders } from "./Icons";

type Mode = "dormant" | "compact" | "expanded";

const SPRING = { type: "spring" as const, stiffness: 430, damping: 36, mass: 0.7 };
const FADE = { duration: 0.15 };
const INSTANT = { duration: 0 };

/** Déplacement minimal avant qu'un appui devienne un déplacement. */
const DRAG_THRESHOLD = 4;
/** Temps de présence avant que le survol ouvre le panneau. */
const HOVER_INTENT_MS = 120;
/** Délai de grâce avant refermeture, pour ne pas perdre le panneau en route. */
const HOVER_GRACE_MS = 220;
/** Au delà, une demande sans réponse fait monter l'insistance visuelle. */
const ESCALATE_AFTER_MS = 30000;

function stateText(session: Session): string {
  switch (session.status) {
    case "attention":
      return `${session.pending?.toolName ?? "outil"} à valider`;
    case "question":
      return "question posée";
    case "waiting":
      return session.message || "en attente";
    case "idle":
      // Le hook Stop de Claude Code marque la fin d'un tour, pas de la session.
      return "tour terminé";
    case "working":
    default: {
      const last = [...session.activity].reverse().find((e) => e.kind === "tool");
      if (session.tool) return session.tool;
      return last?.state === "done" ? "réflexion" : (last?.tool ?? "en cours");
    }
  }
}

export function Crest() {
  const sessions = useCrest((s) => s.sessions);
  const config = useCrest((s) => s.config);
  const hooks = useCrest((s) => s.hooks);
  const hover = useCrest((s) => s.hover);
  const setHover = useCrest((s) => s.setHover);
  const selectedId = useCrest((s) => s.selectedId);
  const select = useCrest((s) => s.select);
  const layout = useCrest((s) => s.layout);
  const setLayout = useCrest((s) => s.setLayout);
  const dragging = useCrest((s) => s.dragging);
  const setDragging = useCrest((s) => s.setDragging);

  const reduceMotion = useReducedMotion();
  const spring = reduceMotion ? INSTANT : SPRING;
  const fade = reduceMotion ? INSTANT : FADE;

  const shell = useRef<HTMLDivElement>(null);
  const insideRef = useRef(false);
  const draggingRef = useRef(false);
  const collapsed = useRef(false);
  const grab = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [keyboard, setKeyboard] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);

  const focus = focusedSession(sessions, selectedId);
  const urgent = needsUser(sessions);
  const working = sessions.some((s) => s.status === "working");
  const queued = pendingCount(sessions);

  useTick(working || urgent, 1000);

  /* La géométrie arrive par son propre canal : elle change à chaque image
     pendant un déplacement, bien plus souvent que l'état des sessions. */
  useEffect(() => window.crest.onLayout(setLayout), [setLayout]);

  /* Taille réelle du pill, nécessaire pour le centrer sur son ancre. Elle est
     mesurée plutôt que devinée parce qu'elle dépend du contenu, et observée
     plutôt que lue une fois parce qu'elle change à chaque changement d'état. */
  useLayoutEffect(() => {
    const node = shell.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      setSize({
        w: box ? box.inlineSize : (entry.target as HTMLElement).offsetWidth,
        h: box ? box.blockSize : (entry.target as HTMLElement).offsetHeight,
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /*
   * Survol.
   *
   * L'interactivité de la fenêtre suit le pointeur sans délai, sinon un clic
   * serait perdu. L'ouverture du panneau, elle, est temporisée : sans ce délai
   * d'intention, traverser le haut de l'écran pour atteindre un onglet
   * déploierait le panneau pour rien. Un délai de grâce à la sortie évite
   * qu'il se referme sous la main quand il rétrécit après une décision.
   */
  useEffect(() => {
    const clearTimers = () => {
      if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
      enterTimer.current = null;
      leaveTimer.current = null;
    };

    const onMove = (event: MouseEvent) => {
      if (draggingRef.current) return;

      const node = shell.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const pad = 6;
      const inside =
        event.clientX >= rect.left - pad &&
        event.clientX <= rect.right + pad &&
        event.clientY >= rect.top - pad &&
        event.clientY <= rect.bottom + pad;

      if (inside === insideRef.current) return;
      insideRef.current = inside;
      window.crest.setInteractive(inside);
      clearTimers();

      if (inside) {
        enterTimer.current = window.setTimeout(() => {
          collapsed.current = false;
          setHover(true);
        }, HOVER_INTENT_MS);
      } else {
        leaveTimer.current = window.setTimeout(() => setHover(false), HOVER_GRACE_MS);
      }
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearTimers();
    };
  }, [setHover]);

  /* Déplacement du pill. Le seuil distingue un clic d'un glissement, ce qui
     permet de garder les boutons utilisables sur la même surface. */
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const start = grab.current;
      if (!start || start.active) return;
      if (Math.hypot(event.screenX - start.x, event.screenY - start.y) < DRAG_THRESHOLD) return;
      start.active = true;
      draggingRef.current = true;
      setDragging(true);
      window.crest.dragStart();
    };

    const onUp = () => {
      const start = grab.current;
      grab.current = null;
      setPressed(false);
      if (!start?.active) return;
      draggingRef.current = false;
      setDragging(false);
      window.crest.dragEnd();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setDragging]);

  const onGrab = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    // Les zones interactives gardent la main sur l'appui, sans quoi cliquer un
    // bouton replierait le panneau sous le curseur avant le relâchement.
    if ((event.target as HTMLElement).closest("button, input, .card-body, .preview")) return;
    grab.current = { x: event.screenX, y: event.screenY, active: false };
    setPressed(true);
  };

  /* Chaque sollicitation nouvelle rouvre le panneau, se repositionne sur
     l'écran actif et sonne une fois. Le suivi porte sur l'identité de chaque
     demande, pas sur un booléen d'urgence : une seconde demande arrivant alors
     qu'une première attend doit rouvrir un panneau que vous venez de replier. */
  const seenDemands = useRef<Set<string>>(new Set());
  useEffect(() => {
    const demands = sessions
      .map((s) =>
        s.pending
          ? `p:${s.pending.requestId}`
          : s.status === "question"
            ? `q:${s.id}:${s.updatedAt}`
            : s.status === "waiting"
              ? `w:${s.id}:${s.updatedAt}`
              : null
      )
      .filter((key): key is string => key !== null);

    const fresh = demands.filter((key) => !seenDemands.current.has(key));
    if (fresh.length > 0) {
      collapsed.current = false;
      setFeedOpen(false);
      window.crest.surface();
      cue("attention", config.muted, config.sounds);
    }
    seenDemands.current = new Set(demands);
  }, [sessions, config.muted, config.sounds]);

  /* Un tour qui s'achève est l'événement que l'on attend le plus souvent :
     il mérite son signal, une fois par session et par transition. */
  const prevStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const session of sessions) {
      const before = prevStatus.current[session.id];
      if (before && before !== "idle" && session.status === "idle") {
        cue("resolved", config.muted, config.sounds);
      }
      prevStatus.current[session.id] = session.status;
    }
    for (const id of Object.keys(prevStatus.current)) {
      if (!sessions.some((s) => s.id === id)) delete prevStatus.current[id];
    }
  }, [sessions, config.muted, config.sounds]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  /* Convocation au clavier : la fenêtre prend le focus, ce qui n'arrive nulle
     part ailleurs, et le panneau reste ouvert tant qu'elle le garde. */
  useEffect(() => {
    const onFocus = () => setKeyboard(true);
    const onBlur = () => setKeyboard(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    const off = window.crest.onSummon(() => {
      collapsed.current = false;
      setKeyboard(true);
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      off();
    };
  }, []);

  const decide = (requestId: string, decision: "allow" | "deny") => {
    void window.crest.decide(requestId, decision);
    cue(decision === "allow" ? "resolved" : "denied", config.muted, config.sounds);
  };

  const always = (requestId: string, sessionId: string, toolName: string) => {
    void window.crest.always(requestId, sessionId, toolName);
    cue("resolved", config.muted, config.sounds);
    setNotice(`${toolName} ne sera plus demandé sur cette session`);
  };

  const answerQuestion = (requestId: string, answers: Answer[]) => {
    void window.crest.answer(requestId, answers);
    cue("resolved", config.muted, config.sounds);
  };

  const skipQuestion = (requestId: string) => {
    void window.crest.skipQuestion(requestId);
    setNotice("Question renvoyée au terminal");
  };

  const jump = async (sessionId: string) => {
    const result = await window.crest.jump(sessionId);
    setNotice(
      result.ok
        ? result.precise
          ? `Terminal ciblé dans ${result.window || "l'éditeur"}`
          : `Fenêtre ${result.window || "du terminal"} activée`
        : result.reason || "Retour au terminal impossible"
    );
  };

  const collapse = () => {
    collapsed.current = true;
    insideRef.current = false;
    setHover(false);
    setKeyboard(false);
    window.crest.setInteractive(false);
    window.crest.releaseFocus();
  };

  /* Raccourcis du panneau. Ils n'agissent que si la fenêtre a le clavier, donc
     après une convocation ou un clic, jamais pendant que vous tapez ailleurs. */
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      const pendingSessions = sessions.filter((s) => s.pending);
      const target = focus?.pending ? focus : pendingSessions[0];

      if (event.key === "Escape") {
        event.preventDefault();
        collapse();
        return;
      }
      if (event.key === "Tab" && pendingSessions.length > 1) {
        event.preventDefault();
        const index = pendingSessions.findIndex((s) => s.id === target?.id);
        const next = pendingSessions[(index + 1) % pendingSessions.length];
        if (next) select(next.id);
        return;
      }
      if (!target?.pending) return;

      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        decide(target.pending.requestId, "allow");
      } else if (key === "r") {
        event.preventDefault();
        decide(target.pending.requestId, "deny");
      } else if (key === "t") {
        event.preventDefault();
        always(target.pending.requestId, target.id, target.pending.toolName);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* La forme compacte est l'état de repos : elle tient en une ligne et annonce
     toujours quelque chose, y compris « aucune session ». Le liseré, qui ne dit
     rien, n'apparaît que si on l'a explicitement demandé. */
  const quiet = !working && !urgent;
  let mode: Mode;
  if (pressed || dragging) mode = "compact";
  else if (urgent && !collapsed.current) mode = "expanded";
  else if (hover || keyboard) mode = "expanded";
  else if (config.minimizeWhenIdle && quiet) mode = "dormant";
  else mode = "compact";

  /* Insistance : une demande laissée sans réponse fait monter l'intensité du
     liseré doré. Une pression ambiante, sans nouveau son ni notification. */
  const waitingSince = sessions.reduce<number | null>(
    (oldest, s) => (s.pending && (oldest === null || s.pending.since < oldest) ? s.pending.since : oldest),
    null
  );
  const attention =
    waitingSince === null
      ? "none"
      : Date.now() - waitingSince > ESCALATE_AFTER_MS
        ? "strong"
        : "soft";

  const compactTarget = focus;
  const edge = layout?.edge ?? "top";
  const decisionPending = Boolean(focus?.pending || focus?.question);
  const showFeed = !decisionPending || feedOpen;

  /* Position du pill dans le conteneur : centré sur l'ancre, ramené à
     l'intérieur des limites, et plaqué contre le bord quand il y est accroché.
     Le rognage produit un mouvement continu là où un changement d'alignement
     produirait un saut. */
  const position = (() => {
    if (!layout) return { left: 0, top: 0 };
    const cw = layout.bounds.width;
    const ch = layout.bounds.height;
    const w = size.w;
    const h = size.h;
    const fit = (value: number, span: number, extent: number) =>
      Math.min(Math.max(value, 0), Math.max(0, span - extent));

    let left = fit(layout.anchor.x - w / 2, cw, w);
    let top = fit(layout.anchor.y - h / 2, ch, h);

    if (edge === "top") top = 0;
    else if (edge === "bottom") top = Math.max(0, ch - h);
    if (edge === "left") left = 0;
    else if (edge === "right") left = Math.max(0, cw - w);

    return { left, top };
  })();

  return (
    <div className="stage">
      <motion.div
        ref={shell}
        className="crest"
        data-mode={mode}
        data-edge={edge}
        data-dragging={dragging}
        data-attention={attention}
        onMouseDown={onGrab}
        onContextMenu={(event) => {
          event.preventDefault();
          window.crest.contextMenu();
        }}
        style={{ left: position.left, top: position.top }}
        /* Aucune animation de disposition pendant un déplacement : elle
           traînerait derrière le curseur au lieu de le suivre. */
        layout={!dragging}
        transition={spring}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={mode}
            layout="position"
            initial={reduceMotion ? false : { opacity: 0, filter: "blur(3px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(3px)" }}
            transition={fade}
          >
            {mode === "dormant" ? <div className="sliver" /> : null}

            {mode === "compact" ? (
              <div className="compact">
                {compactTarget ? (
                  <>
                    <StatusDot status={compactTarget.status} />
                    <span className="name">{compactTarget.label}</span>
                    <span className="detail">{stateText(compactTarget)}</span>
                    <span className="elapsed">
                      {formatDuration(Date.now() - compactTarget.turnStartedAt)}
                    </span>
                    {sessions.length > 1 ? (
                      <span className="badge">{sessions.length}</span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <StatusDot />
                    <span className="name">Vibe Crest</span>
                    <span className="detail">
                      {hooks.installed && !hooks.error ? "aucune session" : "hooks non installés"}
                    </span>
                  </>
                )}
              </div>
            ) : null}

            {mode === "expanded" ? (
              <div className="panel" data-empty={sessions.length === 0}>
                {focus?.pending ? (
                  /* La clé porte l'identifiant de la demande : sans elle React
                     réutiliserait la carte précédente, dont le verrou anti
                     double-clic resterait armé. */
                  <PermissionCard
                    key={focus.pending.requestId}
                    session={focus}
                    onDecide={decide}
                    onAlways={always}
                    onJump={jump}
                  />
                ) : null}

                {focus?.question && !focus.pending ? (
                  <QuestionCard
                    key={focus.question.requestId ?? `q-${focus.id}-${focus.updatedAt}`}
                    session={focus}
                    onAnswer={answerQuestion}
                    onSkip={skipQuestion}
                    onJump={jump}
                  />
                ) : null}

                {notice ? <div className="notice">{notice}</div> : null}

                {sessions.length === 0 ? (
                  <div className="empty">
                    <div className="empty-head">
                      <StatusDot />
                      <span className="empty-title">Aucune session</span>
                    </div>
                    {hooks.installed && !hooks.error ? (
                      <div className="empty-text">
                        Vibe Crest s'anime dès qu'une session Claude Code démarre. Les hooks ne sont
                        lus qu'à l'ouverture d'une session : une session déjà en cours ne remontera
                        pas.
                      </div>
                    ) : (
                      <>
                        <div className="empty-text">
                          {hooks.error
                            ? "Les paramètres de Claude Code n'ont pas pu être lus."
                            : "Les hooks ne sont pas installés, aucun événement ne parviendra ici."}
                        </div>
                        <button
                          className="btn"
                          data-tone="primary"
                          onClick={() => void window.crest.openSettings()}
                        >
                          Ouvrir les réglages
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {sessions.length > 1 ? (
                      <div className="rows">
                        <AnimatePresence initial={false}>
                          {sessions.map((session) => (
                            <motion.button
                              className="row"
                              key={session.id}
                              layout={!reduceMotion}
                              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0, height: "auto" }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                              transition={fade}
                              data-selected={session.id === focus?.id}
                              onClick={() =>
                                select(selectedId === session.id ? null : session.id)
                              }
                            >
                              <StatusDot status={session.status} />
                              <span className="label">{session.label}</span>
                              <span className="state">{stateText(session)}</span>
                              <span className="elapsed">
                                {formatDuration(Date.now() - session.turnStartedAt)}
                              </span>
                              <span className="actions">
                                <span
                                  className="icon-btn"
                                  title="Revenir au terminal"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void jump(session.id);
                                  }}
                                >
                                  <IconJump />
                                </span>
                                <span
                                  className="icon-btn"
                                  title="Retirer cette session du pill"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void window.crest.dismiss(session.id);
                                  }}
                                >
                                  <IconClose />
                                </span>
                              </span>
                            </motion.button>
                          ))}
                        </AnimatePresence>
                      </div>
                    ) : null}

                    {focus ? (
                      <>
                        <div className="detail-head">
                          <StatusDot status={focus.status} />
                          <span className="detail-title">{focus.label}</span>
                          {focus.agent !== "claude" ? (
                            <span className="badge">{focus.agent}</span>
                          ) : null}
                          <span className="detail-meta">
                            {focus.toolCount} appel{focus.toolCount > 1 ? "s" : ""}
                          </span>
                          {focus.subagents > 0 ? (
                            <span className="detail-meta">
                              {focus.subagents} sous-agent{focus.subagents > 1 ? "s" : ""}
                            </span>
                          ) : null}
                          <span className="detail-meta" title="Hôte détecté de la session">
                            {focus.host?.label ?? "hôte inconnu"}
                          </span>
                          {focus.allowRules?.length ? (
                            <button
                              className="badge"
                              data-on="true"
                              title={`Règles actives : ${focus.allowRules.join(", ")}. Cliquer pour les retirer.`}
                              onClick={() => void window.crest.clearRules(focus.id)}
                            >
                              {focus.allowRules.length} règle
                              {focus.allowRules.length > 1 ? "s" : ""}
                            </button>
                          ) : null}
                          <span className="spacer" style={{ flex: 1 }} />
                          <span className="detail-meta">
                            {formatDuration(Date.now() - focus.turnStartedAt)}
                          </span>
                          <button
                            className="icon-btn"
                            title="Revenir au terminal"
                            onClick={() => void jump(focus.id)}
                          >
                            <IconJump />
                          </button>
                          {sessions.length === 1 ? (
                            <button
                              className="icon-btn"
                              title="Retirer cette session du pill"
                              onClick={() => void window.crest.dismiss(focus.id)}
                            >
                              <IconClose />
                            </button>
                          ) : null}
                        </div>

                        {/* Dévoilement progressif : quand une décision attend,
                            elle occupe le panneau et le journal se replie en une
                            ligne. Moins à lire au moment où ça compte. */}
                        {showFeed ? (
                          <ActivityFeed
                            entries={focus.activity}
                            live={focus.status === "working" || focus.status === "attention"}
                            reduceMotion={Boolean(reduceMotion)}
                          />
                        ) : (
                          <button className="feed-toggle" onClick={() => setFeedOpen(true)}>
                            <span className="feed-toggle-text">
                              {focus.activity.length} étape
                              {focus.activity.length > 1 ? "s" : ""} avant celle-ci
                            </span>
                            <IconCollapse />
                          </button>
                        )}
                      </>
                    ) : null}
                  </>
                )}

                <div className="foot">
                  <span className="grip" title="Glisser pour déplacer le pill" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <button
                    className="icon-btn"
                    title="Paramètres"
                    onClick={() => void window.crest.openSettings()}
                  >
                    <IconSliders />
                  </button>
                  <button
                    className="icon-btn"
                    title="Consommation"
                    onClick={() => void window.crest.openUsage()}
                  >
                    <IconGauge />
                  </button>
                  {queued > 1 ? (
                    <button
                      className="badge"
                      data-tone="queue"
                      title="Passer à la demande suivante"
                      onClick={() => {
                        const next = sessions.find((s) => s.pending && s.id !== focus?.id);
                        if (next) select(next.id);
                      }}
                    >
                      {queued} à valider
                    </button>
                  ) : null}
                  {config.autoMode ? (
                    <span className="badge" data-on="true">
                      mode auto
                    </span>
                  ) : null}
                  {config.muted ? <span className="badge">silence</span> : null}
                  {keyboard && focus?.pending ? (
                    <span className="keyhint">
                      <kbd>A</kbd> approuver <kbd>R</kbd> refuser <kbd>T</kbd> toujours
                    </span>
                  ) : null}
                  <span className="spacer" />
                  <button className="icon-btn collapse" title="Replier" onClick={collapse}>
                    <IconCollapse />
                  </button>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
