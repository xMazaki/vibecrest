import { useState } from "react";
import type { Session } from "../types";
import { IconJump } from "./Icons";
import { PreviewBlock } from "./PreviewBlock";

interface Props {
  session: Session;
  onDecide(requestId: string, decision: "allow" | "deny"): void;
  onAlways(requestId: string, sessionId: string, toolName: string): void;
  onJump(sessionId: string): void;
}

/**
 * Chemin raccourci pour l'affichage : la racine du profil devient un tilde,
 * puis on retire des segments par la gauche jusqu'à tenir dans la largeur.
 * On coupe toujours sur une séparation, jamais au milieu d'un nom de dossier.
 */
function shortPath(cwd: string, max = 30): string {
  const normalized = cwd.replace(/\\/g, "/");
  const match = normalized.match(/^[A-Za-z]:\/Users\/[^/]+\/(.*)$/);
  const pretty = match ? `~/${match[1]}` : normalized;
  if (pretty.length <= max) return pretty;

  const parts = pretty.split("/");
  while (parts.length > 2 && parts.join("/").length > max - 2) parts.shift();
  return `…/${parts.join("/")}`;
}

export function PermissionCard({ session, onDecide, onAlways, onJump }: Props) {
  const pending = session.pending;
  const [sent, setSent] = useState(false);
  if (!pending) return null;

  const decide = (decision: "allow" | "deny") => {
    if (sent) return;
    setSent(true);
    onDecide(pending.requestId, decision);
  };

  const always = () => {
    if (sent) return;
    setSent(true);
    onAlways(pending.requestId, session.id, pending.toolName);
  };

  return (
    <div className="card" data-kind="permission">
      <div className="card-head">
        <span className="dot" data-status="attention" />
        <span className="card-tool">{pending.toolName}</span>
        {/* Le fichier visé prime sur le dossier de travail : c'est lui que la
            décision concerne. */}
        <span className="card-where" title={session.cwd}>
          {pending.preview?.title || shortPath(session.cwd)}
        </span>
      </div>

      {/* L'aperçu remplace le résumé d'une ligne : on ne fait pas approuver un
          chemin de fichier, on fait approuver ce qui va changer. */}
      {pending.preview ? (
        <PreviewBlock preview={pending.preview} />
      ) : pending.summary ? (
        <div className="preview">
          <div className="preview-plain">{pending.summary}</div>
        </div>
      ) : null}

      {/* Aucune icône dans les boutons d'action : la hiérarchie se lit au
          contraste et au poids, comme dans une boîte de dialogue système.
          Refuser est écarté des deux boutons permissifs pour limiter les
          erreurs de clic. */}
      <div className="card-actions">
        <button className="btn" data-tone="primary" onClick={() => decide("allow")} disabled={sent}>
          Approuver
        </button>
        <button
          className="btn"
          data-tone="quiet"
          onClick={always}
          disabled={sent}
          title={`Ne plus demander pour ${pending.toolName} jusqu'à la fin de cette session`}
        >
          Toujours
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn" data-tone="quiet" onClick={() => decide("deny")} disabled={sent}>
          Refuser
        </button>
        <button
          className="btn"
          data-tone="ghost"
          onClick={() => onJump(session.id)}
          title="Revenir au terminal"
        >
          <IconJump />
        </button>
      </div>
    </div>
  );
}
