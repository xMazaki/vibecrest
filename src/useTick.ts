import { useEffect, useState } from "react";

/**
 * Réveille le composant à intervalle régulier, uniquement quand c'est utile.
 * Les compteurs de durée sont les seuls éléments qui changent sans événement,
 * et les faire vivre coûte moins qu'un flux poussé depuis le processus principal.
 */
export function useTick(active: boolean, intervalMs = 1000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return tick;
}

/** Durée compacte : 4s, 1m12, 3m, 1h04. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m${String(seconds).padStart(2, "0")}` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${String(minutes % 60).padStart(2, "0")}`;
}

/** Durée d'un appel d'outil, en dessous de la seconde on garde les millisecondes. */
export function formatTook(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  return ms < 1000 ? `${ms}ms` : formatDuration(ms);
}

/** Heure locale sur deux champs, pour l'horodatage du journal. */
export function formatClock(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
    date.getSeconds()
  ).padStart(2, "0")}`;
}
