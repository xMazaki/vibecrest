/**
 * Signaux sonores courts, synthétisés à la volée.
 *
 * Deux notes brèves avec une enveloppe rapide, plutôt qu'un jingle échantillonné.
 * L'objectif est de signaler sans jamais faire sursauter, ce qui exclut les
 * attaques franches et les timbres saturés.
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!context) context = new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function note(ctx: AudioContext, frequency: number, startAt: number, duration: number, gain: number) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = frequency;

  env.gain.setValueAtTime(0, startAt);
  env.gain.linearRampToValueAtTime(gain, startAt + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(env).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

type Cue = "attention" | "resolved" | "denied";

const CUES: Record<Cue, { steps: number[]; gain: number }> = {
  // Intervalle montant, attire l'oreille sans urgence agressive.
  attention: { steps: [587.33, 880.0], gain: 0.05 },
  // Intervalle descendant court, marque la clôture.
  resolved: { steps: [880.0, 659.25], gain: 0.035 },
  // Note unique plus grave.
  denied: { steps: [392.0], gain: 0.04 },
};

export function cue(kind: Cue, muted: boolean, enabled: boolean) {
  if (muted || !enabled) return;
  const ctx = audio();
  if (!ctx) return;
  const cueDef = CUES[kind];
  const start = ctx.currentTime + 0.01;
  cueDef.steps.forEach((frequency, index) => {
    note(ctx, frequency, start + index * 0.085, 0.16, cueDef.gain);
  });
}
