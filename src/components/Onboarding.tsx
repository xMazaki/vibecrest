import { useState } from "react";
import { useCrest } from "../store";
import type { Config } from "../types";

/**
 * Mise en route au premier lancement.
 *
 * Sans hooks installés, l'application ne reçoit rien et paraît cassée : le
 * premier écran ne peut donc pas être une page de bienvenue décorative, il doit
 * mener à une installation. Les questions qui suivent ne portent que sur des
 * choix qui changent réellement l'usage, et chacune a une réponse par défaut :
 * on peut terminer sans rien décider.
 *
 * L'illustration d'ouverture est le pill lui-même, rendu avec les styles de
 * l'application. Montrer l'objet vaut mieux que le décrire, et rien n'est à
 * maintenir en double.
 */

type Approvals = "pill" | "manual" | "auto";

const APPROVAL_PRESETS: Record<Approvals, Partial<Config>> = {
  pill: {
    autoMode: false,
    gatedTools: [
      "Bash",
      "PowerShell",
      "Write",
      "Edit",
      "MultiEdit",
      "NotebookEdit",
      "WebFetch",
      "WebSearch",
      "ExitPlanMode",
      "mcp__*",
    ],
  },
  manual: { autoMode: false, gatedTools: ["Bash", "PowerShell", "Write", "Edit", "MultiEdit"] },
  auto: { autoMode: true },
};

const STEPS = ["Bienvenue", "Connexion", "Réglages", "Prêt"];

function Choice({
  label,
  desc,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button className="choice" data-on={active} onClick={onClick}>
      <span className="choice-label">{label}</span>
      <span className="choice-desc">{desc}</span>
    </button>
  );
}

/** Ligne d'état avec une action, motif répété de l'écran de connexion. */
function Link({
  ok,
  label,
  action,
  onAction,
  busy,
}: {
  ok: boolean;
  label: string;
  action?: string;
  onAction?(): void;
  busy?: boolean;
}) {
  return (
    <div className="ob-link" data-ok={ok}>
      <span className="dot" data-status={ok ? "idle" : "attention"} />
      <span className="ob-link-label">{label}</span>
      {!ok && action && onAction ? (
        <button className="btn" data-tone="primary" onClick={onAction} disabled={busy}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function Onboarding() {
  const hooks = useCrest((s) => s.hooks);
  const editors = useCrest((s) => s.editors);
  const codex = useCrest((s) => s.codex);
  const autostart = useCrest((s) => s.autostart);
  const config = useCrest((s) => s.config);
  const shortcut = useCrest((s) => s.shortcut);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<Approvals>("pill");

  const install = async () => {
    setBusy(true);
    setNotice(null);
    const result = await window.crest.installHooks();
    setBusy(false);
    if (!result.ok) setNotice(result.error ?? "L'installation a échoué.");
  };

  const finish = async () => {
    await window.crest.setConfig({ ...APPROVAL_PRESETS[approvals], onboarded: true });
    window.close();
  };

  return (
    <div className="onboarding">
      <header className="ob-top">
        <span className="ob-mark">Vibe Crest</span>
        <span className="ob-count">
          {step + 1} <span className="ob-count-sep">sur</span> {STEPS.length}
        </span>
      </header>

      <div className="ob-rail" role="progressbar" aria-valuenow={step + 1} aria-valuemax={STEPS.length}>
        <span className="ob-rail-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <main className="ob-body">
        {step === 0 ? (
          <>
            <div className="ob-stage">
              <div className="crest" data-mode="compact" data-edge="free">
                <div className="compact">
                  <span className="dot" data-status="working" />
                  <span className="name">votre-projet</span>
                  <span className="detail">Edit</span>
                  <span className="elapsed">1m42</span>
                </div>
              </div>
            </div>
            <h1 className="ob-title">
              Vos agents, à portée
              <br />
              de regard.
            </h1>
            <p className="ob-lead">
              Un panneau posé sur le bord de l'écran montre ce que font vos sessions Claude Code et
              vous laisse approuver leurs actions sans changer de fenêtre.
            </p>
            <p className="ob-aside">
              Tout reste sur la machine. Un canal local entre les hooks et l'application, aucune
              sortie réseau, aucune télémétrie.
            </p>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 className="ob-title">Connexion</h1>
            <p className="ob-lead">
              Claude Code appelle un court script à chaque événement. C'est ce qui alimente le
              panneau, et sans lui rien ne remontera.
            </p>

            <div className="ob-links">
              <Link
                ok={hooks.installed && !hooks.error}
                label={
                  hooks.error
                    ? hooks.error
                    : hooks.installed
                      ? "Hooks Claude Code installés"
                      : "Hooks Claude Code"
                }
                action="Installer"
                onAction={install}
                busy={busy}
              />

              {editors.editors.length > 0 ? (
                <Link
                  ok={editors.anyInstalled}
                  label={
                    editors.anyInstalled
                      ? "Extension éditeur installée"
                      : "Extension éditeur, pour viser le terminal exact"
                  }
                  action="Installer"
                  onAction={() => void window.crest.installEditorExtension()}
                  busy={busy}
                />
              ) : null}

              {codex.present ? (
                <Link
                  ok={codex.installed}
                  label={
                    codex.installed
                      ? "Codex connecté, fins de tour uniquement"
                      : "Codex, fins de tour uniquement"
                  }
                  action="Connecter"
                  onAction={() => void window.crest.installCodex()}
                  busy={busy}
                />
              ) : null}
            </div>

            {notice ? <p className="ob-aside">{notice}</p> : null}
            <p className="ob-aside">
              Les hooks sont lus à l'ouverture d'une session. Une session déjà en cours ne remontera
              pas.
            </p>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 className="ob-title">Réglages</h1>
            <p className="ob-lead">Trois choix, tous modifiables ensuite.</p>

            <div className="ob-section">
              <span className="ob-legend">Ce qui passe par le panneau</span>
              <div className="choices">
                <Choice
                  label="Tout"
                  desc="Exécution, écritures, réseau et validations de plan."
                  active={approvals === "pill"}
                  onClick={() => setApprovals("pill")}
                />
                <Choice
                  label="Le risqué seulement"
                  desc="Commandes et écritures. Le reste garde l'invite du terminal."
                  active={approvals === "manual"}
                  onClick={() => setApprovals("manual")}
                />
                <Choice
                  label="Rien"
                  desc="Tout est approuvé automatiquement, le panneau observe."
                  active={approvals === "auto"}
                  onClick={() => setApprovals("auto")}
                />
              </div>
            </div>

            <div className="ob-section">
              <div className="field">
                <div className="text">
                  <div className="name">Signaux sonores</div>
                  <div className="desc">Deux notes brèves quand l'agent vous attend ou termine.</div>
                </div>
                <button
                  className="switch"
                  data-on={config.sounds}
                  role="switch"
                  aria-checked={config.sounds}
                  aria-label="Signaux sonores"
                  onClick={() => void window.crest.setConfig({ sounds: !config.sounds })}
                />
              </div>
              <div className="field">
                <div className="text">
                  <div className="name">Lancer au démarrage</div>
                  <div className="desc">Présent dès l'ouverture de session Windows.</div>
                </div>
                <button
                  className="switch"
                  data-on={autostart}
                  role="switch"
                  aria-checked={autostart}
                  aria-label="Lancer au démarrage"
                  onClick={() => void window.crest.setAutostart(!autostart)}
                />
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1 className="ob-title">Prêt.</h1>
            <p className="ob-lead">
              Ouvrez une nouvelle session Claude Code pour la voir apparaître.
            </p>

            <dl className="ob-keys">
              <div className="ob-key">
                <dt>
                  <kbd>{shortcut.accelerator ?? "Alt+G"}</kbd>
                </dt>
                <dd>faire venir le panneau et lui donner le clavier</dd>
              </div>
              <div className="ob-key">
                <dt>
                  <kbd>A</kbd> <kbd>R</kbd> <kbd>T</kbd>
                </dt>
                <dd>approuver, refuser, ne plus demander</dd>
              </div>
              <div className="ob-key">
                <dt>
                  <kbd>Échap</kbd>
                </dt>
                <dd>replier et rendre le clavier</dd>
              </div>
            </dl>

            <p className="ob-aside">
              Attrapez le panneau pour le poser où vous voulez, sur n'importe quel bord ou en
              flottant. Clic droit pour les réglages rapides.
            </p>
          </>
        ) : null}
      </main>

      <footer className="ob-foot">
        <button
          className="btn"
          data-tone="quiet"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Retour
        </button>
        <span style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <button className="btn" data-tone="primary" onClick={() => setStep((s) => s + 1)}>
            Continuer
          </button>
        ) : (
          <button className="btn" data-tone="primary" onClick={finish}>
            Commencer
          </button>
        )}
      </footer>
    </div>
  );
}
