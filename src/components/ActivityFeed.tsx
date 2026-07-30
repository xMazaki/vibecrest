import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ActivityEntry } from "../types";
import { formatClock, formatTook } from "../useTick";

interface Props {
  entries: ActivityEntry[];
  /** Un tour en cours maintient le défilement collé au bas de la liste. */
  live: boolean;
  reduceMotion: boolean;
}

function label(entry: ActivityEntry): string {
  switch (entry.kind) {
    case "prompt":
      return "prompt";
    case "session":
      return "session";
    case "notice":
      return "attente";
    case "stop":
      return "fin";
    case "subagent":
      return "sous-agent";
    default:
      return entry.tool || "outil";
  }
}

/**
 * Journal temps réel de ce que fait l'agent : chaque appel d'outil apparaît dès
 * son déclenchement, puis se complète de sa durée à la fin.
 *
 * Les lignes arrivent en glissant depuis le haut et repartent en s'effondrant.
 * Une liste qui se réécrit d'un coup se lit comme un rafraîchissement, une
 * liste qui se déroule se lit comme une activité.
 */
export function ActivityFeed({ entries, live, reduceMotion }: Props) {
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (live) bottom.current?.scrollIntoView({ block: "end" });
  }, [entries.length, live]);

  if (entries.length === 0) {
    return <div className="feed-empty">Aucune activité pour le moment.</div>;
  }

  return (
    <div className="feed">
      <AnimatePresence initial={false}>
        {entries.map((entry, index) => {
          const detail = entry.kind === "tool" || entry.kind === "subagent" ? entry.detail : entry.text;
          return (
            <motion.div
              className="feed-row"
              key={entry.id ?? `${entry.at}-${index}`}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              data-state={entry.state ?? "done"}
              data-kind={entry.kind}
            >
              <span className="feed-time">{formatClock(entry.at)}</span>
              <span className="feed-tool">{label(entry)}</span>
              <span className="feed-detail" data-kind={entry.kind} title={detail || ""}>
                {detail || ""}
              </span>
              {entry.outcome ? (
                <span className="feed-meta" data-outcome={entry.outcome}>
                  {entry.outcome}
                </span>
              ) : entry.state === "running" ? (
                <span className="feed-meta">en cours</span>
              ) : entry.state === "pending" ? (
                <span className="feed-meta">à valider</span>
              ) : entry.tookMs != null ? (
                <span className="feed-meta">{formatTook(entry.tookMs)}</span>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={bottom} />
    </div>
  );
}
