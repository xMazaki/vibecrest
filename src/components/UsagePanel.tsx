import { useEffect } from "react";
import { useCrest } from "../store";
import type { UsageBucket } from "../types";
import { IconClose, IconRefresh } from "./Icons";

/**
 * Surface flottante de consommation.
 *
 * Séparée du pill à dessein : le pill sert à décider vite, ces chiffres se
 * lisent posément. Elle se referme dès qu'on regarde ailleurs.
 *
 * C'est le seul endroit de l'application où la couleur sert à autre chose qu'à
 * signaler une sollicitation. Ici elle encode une quantité et une catégorie,
 * ce qui est son emploi légitime, et la gamme reste chaude pour rester dans la
 * matière du reste. L'or n'y apparaît pas, afin de ne pas diluer son sens.
 */

/**
 * Le cache lu est tenu à l'écart de la composition.
 *
 * Il pèse couramment cent fois les autres postes, ce qui écraserait la barre et
 * rendrait illisible ce qui coûte réellement. Ce n'est d'ailleurs pas une
 * consommation nouvelle mais du contexte relu. Il garde donc sa propre ligne.
 */
const SEGMENTS = [
  { key: "output", label: "sortie", tone: "output" },
  { key: "input", label: "entrée", tone: "input" },
  { key: "cacheWrite", label: "cache écrit", tone: "cache-write" },
] as const;

function compact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} k`;
  if (value < 1_000_000_000) {
    return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 2 : 1)} M`;
  }
  return `${(value / 1_000_000_000).toFixed(2)} Md`;
}

/** Jetons réellement consommés : le contexte relu depuis le cache n'en est pas. */
function billableOf(bucket: UsageBucket | undefined): number {
  if (!bucket) return 0;
  return bucket.input + bucket.output + bucket.cacheWrite;
}

function clock(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function Composition({ bucket }: { bucket: UsageBucket }) {
  const total = billableOf(bucket) || 1;
  return (
    <>
      <div className="u-bar" role="img" aria-label="Répartition des jetons consommés">
        {SEGMENTS.map((segment) => {
          const value = bucket[segment.key];
          if (value <= 0) return null;
          return (
            <span
              key={segment.key}
              className="u-seg"
              data-tone={segment.tone}
              style={{ flexGrow: value / total }}
              title={`${segment.label} : ${compact(value)}`}
            />
          );
        })}
      </div>
      <div className="u-legend">
        {SEGMENTS.map((segment) => (
          <span className="u-legend-item" key={segment.key}>
            <span className="u-chip" data-tone={segment.tone} />
            <span className="u-legend-label">{segment.label}</span>
            <span className="u-legend-value">{compact(bucket[segment.key])}</span>
          </span>
        ))}
        <span className="u-legend-item" data-aside="true">
          <span className="u-chip" data-tone="cache-read" />
          <span className="u-legend-label">cache lu</span>
          <span className="u-legend-value">{compact(bucket.cacheRead)}</span>
        </span>
      </div>
    </>
  );
}

function Meter({ ratio, tone }: { ratio: number; tone?: string }) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return (
    <div className="u-meter">
      <span className="u-meter-fill" data-tone={tone} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

export function UsagePanel() {
  const report = useCrest((s) => s.usage);
  const limit = useCrest((s) => s.config.usageLimit);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.crest.closeUsage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!report) {
    return (
      <div className="usage-panel">
        <div className="u-head">
          <span className="u-title">Consommation</span>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" onClick={() => window.crest.closeUsage()} title="Fermer">
            <IconClose />
          </button>
        </div>
        <div className="hint">Aucune transcription lisible pour le moment.</div>
      </div>
    );
  }

  const billable = billableOf(report.window);
  const now = Date.now();
  const elapsedRatio =
    report.windowResetsAt === null
      ? 0
      : 1 - Math.max(0, report.windowResetsAt - now) / report.windowMs;
  const modelMax = Math.max(1, ...report.byModel.map((entry) => entry.output));
  const codex = report.codex;

  return (
    <div className="usage-panel">
      <div className="u-head">
        <span className="u-title">Consommation</span>
        <span style={{ flex: 1 }} />
        <button
          className="icon-btn"
          onClick={() => void window.crest.refreshUsage()}
          title="Recalculer"
        >
          <IconRefresh />
        </button>
        <button className="icon-btn" onClick={() => window.crest.closeUsage()} title="Fermer">
          <IconClose />
        </button>
      </div>

      <div className="u-hero">
        <span className="u-hero-value">{compact(billable)}</span>
        <span className="u-hero-unit">
          jetons consommés sur 5 heures,
          <br />
          hors contexte relu depuis le cache
        </span>
        <span className="u-hero-turns">
          {report.window.turns} tour{report.window.turns > 1 ? "s" : ""}
        </span>
      </div>

      <Composition bucket={report.window} />

      {limit > 0 ? (
        <div className="u-block">
          <div className="u-block-head">
            <span className="u-block-title">Votre repère</span>
            <span className="u-block-value">
              {compact(billable)} sur {compact(limit)}
            </span>
          </div>
          <Meter ratio={billable / limit} tone="output" />
          <div className="u-note">
            Hors cache lu. Ce repère est celui que vous avez saisi dans les réglages, l'abonnement
            n'expose aucune limite lisible localement.
          </div>
        </div>
      ) : null}

      {report.windowResetsAt ? (
        <div className="u-block">
          <div className="u-block-head">
            <span className="u-block-title">Fenêtre glissante</span>
            <span className="u-block-value">se dégage à {clock(report.windowResetsAt)}</span>
          </div>
          <Meter ratio={elapsedRatio} />
          <div className="u-note">
            Position de la plus ancienne consommation encore comptée dans la fenêtre.
          </div>
        </div>
      ) : null}

      {report.byModel.length > 0 ? (
        <div className="u-block">
          <div className="u-block-head">
            <span className="u-block-title">Modèles</span>
          </div>
          {report.byModel.map((entry) => (
            <div className="u-model" key={entry.model}>
              <span className="u-model-name">{entry.model}</span>
              <span className="u-model-bar">
                <span
                  className="u-model-fill"
                  style={{ width: `${(entry.output / modelMax) * 100}%` }}
                />
              </span>
              <span className="u-model-value">{compact(entry.output)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="u-block">
        <div className="u-block-head">
          <span className="u-block-title">Cumuls</span>
        </div>
        <div className="u-tally">
          <div className="u-tally-cell">
            <span className="u-tally-value">{compact(billableOf(report.today))}</span>
            <span className="u-tally-label">aujourd'hui</span>
          </div>
          <div className="u-tally-cell">
            <span className="u-tally-value">{compact(billableOf(report.total))}</span>
            <span className="u-tally-label">tout l'historique lu</span>
          </div>
          <div className="u-tally-cell">
            <span className="u-tally-value">{report.today.turns}</span>
            <span className="u-tally-label">tours aujourd'hui</span>
          </div>
        </div>
      </div>

      <div className="u-block">
        <div className="u-block-head">
          <span className="u-block-title">Codex</span>
        </div>
        {codex?.available ? (
          <div className="u-tally">
            <div className="u-tally-cell">
              <span className="u-tally-value">{compact(billableOf(codex.window))}</span>
              <span className="u-tally-label">sur 5 heures</span>
            </div>
            <div className="u-tally-cell">
              <span className="u-tally-value">{compact(billableOf(codex.total))}</span>
              <span className="u-tally-label">au total</span>
            </div>
          </div>
        ) : (
          <div className="u-note">{codex?.reason ?? "Codex n'est pas installé."}</div>
        )}
      </div>

      {report.truncated ? (
        <div className="u-note">
          Volume de transcriptions important : le calcul s'est arrêté avant d'avoir tout lu.
        </div>
      ) : null}
    </div>
  );
}
