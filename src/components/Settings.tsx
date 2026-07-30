import { useState } from "react";
import { useCrest } from "../store";
import type { Config } from "../types";

/** Tout ce qui peut être intercepté. */
const GATEABLE = [
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
  "Task",
  "SlashCommand",
  "Skill",
  "Read",
  "Glob",
  "Grep",
];

/**
 * Tout ce pour quoi Claude Code demande habituellement confirmation.
 * PowerShell y figure : sous Windows c'est un outil distinct de Bash.
 */
const RECOMMENDED = [
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
];

/** Ne laisse au terminal que la lecture pure. */
const READ_ONLY = ["Read", "Glob", "Grep"];
const EVERYTHING = GATEABLE.filter((tool) => !READ_ONLY.includes(tool));

function Toggle({
  name,
  desc,
  value,
  onChange,
}: {
  name: string;
  desc?: string;
  value: boolean;
  onChange(next: boolean): void;
}) {
  return (
    <div className="field">
      <div className="text">
        <div className="name">{name}</div>
        {desc ? <div className="desc">{desc}</div> : null}
      </div>
      <button
        className="switch"
        data-on={value}
        role="switch"
        aria-checked={value}
        aria-label={name}
        onClick={() => onChange(!value)}
      />
    </div>
  );
}

function NumberField({
  name,
  desc,
  value,
  step,
  onChange,
}: {
  name: string;
  desc?: string;
  value: number;
  step?: number;
  onChange(next: number): void;
}) {
  return (
    <div className="field">
      <div className="text">
        <div className="name">{name}</div>
        {desc ? <div className="desc">{desc}</div> : null}
      </div>
      <input
        className="num"
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </div>
  );
}

export function Settings() {
  const config = useCrest((s) => s.config);
  const hooks = useCrest((s) => s.hooks);
  const placementLabel = useCrest((s) => s.placementLabel);
  const editors = useCrest((s) => s.editors);
  const autostart = useCrest((s) => s.autostart);
  const codex = useCrest((s) => s.codex);
  const shortcut = useCrest((s) => s.shortcut);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = (next: Partial<Config>) => {
    void window.crest.setConfig(next);
  };

  const toggleTool = (tool: string) => {
    const set = new Set(config.gatedTools);
    if (set.has(tool)) set.delete(tool);
    else set.add(tool);
    patch({ gatedTools: [...set] });
  };

  const install = async () => {
    setBusy(true);
    setNotice(null);
    const result = await window.crest.installHooks();
    setBusy(false);
    setNotice(
      result.ok
        ? "Hooks installés. Ouvrez une nouvelle session Claude Code pour les activer."
        : `Échec : ${result.error}`
    );
  };

  const uninstall = async () => {
    setBusy(true);
    setNotice(null);
    const result = await window.crest.uninstallHooks();
    setBusy(false);
    setNotice(result.ok ? "Hooks retirés des paramètres de Claude Code." : `Échec : ${result.error}`);
  };

  const installExtension = async () => {
    setBusy(true);
    setNotice(null);
    const result = await window.crest.installEditorExtension();
    setBusy(false);
    const targets = result.results.map((r) => r.editor).join(", ");
    setNotice(
      result.ok
        ? `Extension installée dans ${targets}. Redémarrez l'éditeur pour l'activer.`
        : `Échec partiel : ${result.results.filter((r) => !r.ok).map((r) => `${r.editor} (${r.error})`).join(", ")}`
    );
  };

  const uninstallExtension = async () => {
    setBusy(true);
    setNotice(null);
    const result = await window.crest.uninstallEditorExtension();
    setBusy(false);
    setNotice(result.ok ? "Extension retirée." : "Échec du retrait de l'extension.");
  };

  const reveal = async () => {
    const result = await window.crest.revealConfig();
    if (!result.ok) setNotice(result.reason || "Ouverture du dossier impossible");
  };

  const hookState = hooks.error
    ? hooks.error
    : (hooks.installed || hooks.partial) && !hooks.scriptPresent
      ? "Hooks enregistrés mais script manquant. Réinstallez, sinon Claude Code signalera une erreur à chaque événement."
      : hooks.installed
        ? "Hooks actifs sur les sept événements de Claude Code."
        : hooks.partial
          ? "Installation partielle, réinstallez pour compléter."
          : "Hooks absents, Vibe Crest ne recevra aucun événement.";

  return (
    <div className="settings">
      <h1>Vibe Crest</h1>

      <div className="section">
        <h2>Connexion à Claude Code</h2>
        <div className="status-line" data-ok={hooks.installed && !hooks.error}>
          <span className="dot" data-status={hooks.installed ? "idle" : "attention"} />
          <span style={{ flex: 1 }}>{hookState}</span>
        </div>
        <div style={{ display: "flex", gap: 8, paddingTop: 12 }}>
          <button className="btn" data-tone="primary" onClick={install} disabled={busy}>
            {hooks.installed ? "Réinstaller" : "Installer les hooks"}
          </button>
          <button className="btn" onClick={uninstall} disabled={busy || !hooks.installed}>
            Retirer
          </button>
        </div>
        {notice ? (
          <div className="hint" style={{ paddingTop: 12 }}>
            {notice}
          </div>
        ) : null}
        <div className="hint" style={{ paddingTop: 12 }}>
          L'installation sauvegarde votre <span className="mono-path">~/.claude/settings.json</span>{" "}
          avant toute écriture, et refuse de continuer si le fichier est illisible.
        </div>
        <div className="hint" style={{ paddingTop: 8 }}>
          Avant de désinstaller Vibe Crest, utilisez <strong>Retirer</strong>. Des hooks laissés
          enregistrés sans leur script feraient signaler une erreur à chaque réponse de Claude Code.
        </div>
      </div>

      <div className="section">
        <h2>Retour au terminal</h2>
        {editors.editors.length === 0 ? (
          <div className="hint">
            Aucun éditeur de la famille VS Code détecté. Le retour au terminal active la fenêtre
            de l'hôte, ce qui est tout ce que Windows permet en dehors d'un éditeur.
          </div>
        ) : (
          <>
            <div className="status-line" data-ok={editors.anyInstalled}>
              <span className="dot" data-status={editors.anyInstalled ? "idle" : "attention"} />
              <span style={{ flex: 1 }}>
                {editors.anyInstalled
                  ? "Extension installée, le retour vise le panneau de terminal exact."
                  : "Extension absente, le retour se limite à activer la fenêtre."}
              </span>
            </div>
            <div className="chips">
              {editors.editors.map((editor) => (
                <span key={editor.kind} className="chip" data-on={editor.installed}>
                  {editor.label}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, paddingTop: 12 }}>
              <button className="btn" data-tone="primary" onClick={installExtension} disabled={busy}>
                {editors.anyInstalled ? "Réinstaller l'extension" : "Installer l'extension"}
              </button>
              <button
                className="btn"
                onClick={uninstallExtension}
                disabled={busy || !editors.anyInstalled}
              >
                Retirer
              </button>
            </div>
            <div className="hint" style={{ paddingTop: 12 }}>
              Windows n'expose aucun moyen de donner le focus à un onglet précis de terminal. À
              l'intérieur de VS Code en revanche, l'API le permet : Vibe Crest active la fenêtre,
              puis l'extension finit le travail. Redémarrez l'éditeur après l'installation.
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h2>Consommation</h2>
        <div className="hint">
          Les chiffres se lisent dans la surface flottante, par l'icône de barres en bas du
          panneau. Ce réglage n'y sert qu'à poser un repère.
        </div>
        <NumberField
          name="Repère de jetons par fenêtre"
          desc="Jetons hors cache lu sur cinq heures. Zéro n'affiche aucune jauge. L'abonnement n'expose aucune limite lisible localement, ce repère est donc le vôtre."
          value={config.usageLimit}
          step={100000}
          onChange={(v) => patch({ usageLimit: Math.max(0, v) })}
        />
      </div>

      <div className="section">
        <h2>Codex</h2>
        {!codex.present ? (
          <div className="hint">
            Codex CLI n'est pas installé sur cette machine. Rien à connecter.
          </div>
        ) : (
          <>
            <div className="status-line" data-ok={codex.installed}>
              <span className="dot" data-status={codex.installed ? "idle" : "attention"} />
              <span style={{ flex: 1 }}>
                {codex.error
                  ? codex.error
                  : codex.installed
                    ? "Codex connecté."
                    : "Codex détecté mais non connecté."}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, paddingTop: 12 }}>
              <button
                className="btn"
                data-tone="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await window.crest.installCodex();
                  setBusy(false);
                  if (!result.ok) setNotice(result.error ?? "Échec de la connexion à Codex.");
                }}
              >
                {codex.installed ? "Reconnecter" : "Connecter Codex"}
              </button>
              <button
                className="btn"
                disabled={busy || !codex.installed}
                onClick={() => void window.crest.uninstallCodex()}
              >
                Retirer
              </button>
            </div>
            <div className="hint" style={{ paddingTop: 12 }}>
              Codex n'expose qu'un événement, la fin de tour. Pas d'approbation ni de journal
              d'outils.
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h2>Placement</h2>
        <div className="status-line">
          <span className="dot" data-status="idle" />
          <span style={{ flex: 1 }}>{placementLabel || "Accroché en haut"}</span>
        </div>
        <div className="hint" style={{ paddingTop: 12 }}>
          Le pill se déplace à la souris : attrapez-le et posez-le où vous voulez, sur n'importe
          quel écran. Près d'un bord il s'y accroche, au centre il reste flottant. Le panneau
          s'ouvre toujours du côté où il y a de la place.
        </div>
        <div style={{ display: "flex", gap: 8, paddingTop: 12 }}>
          <button className="btn" onClick={() => void window.crest.resetPlacement()}>
            Replacer en haut au centre
          </button>
        </div>
      </div>

      <div className="section">
        <h2>Comportement</h2>
        <Toggle
          name="Lancer au démarrage de Windows"
          desc="Vibe Crest apparaît dans la zone de notification à l'ouverture de session."
          value={autostart}
          onChange={(v) => {
            void window.crest.setAutostart(v).then((result) => {
              if (!result.ok) setNotice(`Impossible de modifier le démarrage : ${result.reason}`);
            });
          }}
        />
        <Toggle
          name="Mode auto"
          desc="Approuve tout sans demander. Le pill continue d'afficher l'activité."
          value={config.autoMode}
          onChange={(v) => patch({ autoMode: v })}
        />
        <div className="field">
          <div className="text">
            <div className="name">Raccourci de convocation</div>
            <div className="desc">
              {shortcut.error
                ? shortcut.error
                : shortcut.accelerator
                  ? `${shortcut.accelerator} fait venir le pill et lui donne le clavier. Ensuite A approuve, R refuse, T pose une règle, Tab passe à la suivante, Échap replie.`
                  : "Aucun raccourci actif."}
            </div>
          </div>
          <input
            className="num"
            style={{ width: 110, fontFamily: "var(--mono)" }}
            value={config.summonShortcut}
            spellCheck={false}
            onChange={(e) => patch({ summonShortcut: e.target.value })}
          />
        </div>
        <Toggle
          name="Réduire à un liseré au repos"
          desc="Quand rien ne se passe, le pill se réduit à une fine barre au lieu d'afficher son état. Discret, mais muet."
          value={config.minimizeWhenIdle}
          onChange={(v) => patch({ minimizeWhenIdle: v })}
        />
        <Toggle name="Signaux sonores" value={config.sounds} onChange={(v) => patch({ sounds: v })} />
        <Toggle
          name="Silence"
          desc="Coupe tous les sons sans changer le réglage précédent."
          value={config.muted}
          onChange={(v) => patch({ muted: v })}
        />
        <NumberField
          name="Retrait des sessions au repos"
          desc="Millisecondes après la fin d'un tour. Zéro conserve la session jusqu'à sa vraie fermeture, ce qui est le réglage conseillé."
          value={config.dismissAfterMs}
          step={5000}
          onChange={(v) => patch({ dismissAfterMs: Math.max(0, v) })}
        />
        <NumberField
          name="Attente maximale d'une décision"
          desc="Millisecondes. Passé ce délai, la main revient à l'invite du terminal."
          value={config.decisionTimeoutMs}
          step={30000}
          onChange={(v) => patch({ decisionTimeoutMs: Math.max(10000, v) })}
        />
      </div>

      <div className="section">
        <h2>Outils soumis à approbation</h2>
        <div className="hint">
          Ces outils passent par le pill au lieu de l'invite du terminal. Un outil absent d'ici
          garde le comportement natif de Claude Code : c'est la raison la plus fréquente d'une
          demande qui apparaît dans le terminal plutôt que dans le pill.
        </div>
        <div className="chips">
          {GATEABLE.map((tool) => (
            <button
              key={tool}
              className="chip"
              data-on={config.gatedTools.includes(tool)}
              onClick={() => toggleTool(tool)}
            >
              {tool}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingTop: 14 }}>
          <button className="btn" onClick={() => patch({ gatedTools: [...RECOMMENDED] })}>
            Liste recommandée
          </button>
          <button className="btn" onClick={() => patch({ gatedTools: [...EVERYTHING] })}>
            Tout sauf la lecture
          </button>
        </div>
        <div className="hint" style={{ paddingTop: 10 }}>
          Les questions posées par l'agent sont toujours interceptées, quel que soit ce réglage.
        </div>
      </div>

      <div className="section">
        <h2>Divers</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={reveal}>
            Ouvrir le dossier de configuration
          </button>
          <button className="btn" data-tone="quiet" onClick={() => void window.crest.quit()}>
            Quitter Vibe Crest
          </button>
        </div>
      </div>
    </div>
  );
}
