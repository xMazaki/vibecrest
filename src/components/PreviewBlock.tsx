import type { Preview } from "../types";
import { Markdown } from "./Markdown";

/**
 * Rendu de l'aperçu d'une action avant approbation.
 *
 * Chaque nature d'action a sa forme propre : une commande se lit en monospace,
 * une modification se lit en différence, un plan se lit en Markdown. Le but
 * n'est pas d'afficher la charge utile mais de rendre la décision possible.
 */

function Diff({ rows, added, removed }: { rows: Preview["rows"]; added?: number; removed?: number }) {
  if (!rows) return null;
  return (
    <>
      <div className="diff">
        {rows.map((row, index) => (
          <div className="diff-row" data-sign={row.sign} key={index}>
            <span className="diff-gutter">{row.sign === "~" ? "" : row.sign}</span>
            <span className="diff-text">{row.text}</span>
          </div>
        ))}
      </div>
      {added != null && removed != null ? (
        <div className="diff-tally">
          <span data-sign="+">{added} ajoutée{added > 1 ? "s" : ""}</span>
          <span data-sign="-">{removed} retirée{removed > 1 ? "s" : ""}</span>
        </div>
      ) : null}
    </>
  );
}

export function PreviewBlock({ preview }: { preview: Preview | null | undefined }) {
  if (!preview) return null;

  const clipped =
    preview.clipped && preview.clipped > 0 ? (
      <div className="preview-clip">
        {preview.clipped} ligne{preview.clipped > 1 ? "s" : ""} de plus, non affichée
        {preview.clipped > 1 ? "s" : ""}
      </div>
    ) : null;

  switch (preview.kind) {
    case "diff":
      return (
        <div className="preview">
          <Diff rows={preview.rows} added={preview.added} removed={preview.removed} />
        </div>
      );

    case "multi":
      return (
        <div className="preview">
          <div className="preview-label">
            {preview.count} modification{(preview.count ?? 0) > 1 ? "s" : ""} dans ce fichier
          </div>
          {(preview.parts ?? []).map((part, index) => (
            <div className="preview-part" key={index}>
              {part.kind === "diff" ? (
                <Diff rows={part.rows} added={part.added} removed={part.removed} />
              ) : (
                <div className="preview-note">{part.body}</div>
              )}
            </div>
          ))}
        </div>
      );

    case "command":
      return (
        <div className="preview">
          {preview.title ? <div className="preview-label">{preview.title}</div> : null}
          <pre className="preview-code" data-shell={preview.shell}>
            {preview.body}
          </pre>
          {clipped}
        </div>
      );

    case "text":
      return (
        <div className="preview">
          <pre className="preview-code">{preview.body}</pre>
          {clipped}
        </div>
      );

    case "markdown":
      return (
        <div className="preview">
          <div className="preview-md">
            <Markdown source={preview.body ?? ""} />
          </div>
          {clipped}
        </div>
      );

    case "note":
      return (
        <div className="preview">
          <div className="preview-note">{preview.body}</div>
        </div>
      );

    default:
      return preview.body ? (
        <div className="preview">
          <div className="preview-plain">{preview.body}</div>
        </div>
      ) : null;
  }
}
