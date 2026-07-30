import { Fragment, type ReactNode } from "react";

/**
 * Rendu Markdown minimal, pour les plans proposés par l'agent.
 *
 * Volontairement écrit à la main plutôt que tiré d'une librairie : le besoin se
 * limite aux titres, listes, blocs de code et emphases, et surtout le résultat
 * est produit sous forme de nœuds React. Aucun HTML n'est injecté, donc aucune
 * surface d'injection, là où un rendu par innerHTML en ouvrirait une pour un
 * contenu qui vient du modèle.
 */

/** Découpe une ligne en fragments emphase, code et texte. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code className="md-code" key={key}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const lines = String(source ?? "").split("\n");
  const blocks: ReactNode[] = [];

  let listItems: string[] = [];
  let codeLines: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul className="md-list" key={`l${key++}`}>
        {listItems.map((item, i) => (
          <li key={i}>{inline(item, `li${key}-${i}`)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (codeLines === null) {
        flushList();
        codeLines = [];
      } else {
        blocks.push(
          <pre className="md-pre" key={`c${key++}`}>
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = null;
      }
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(
        <div className="md-heading" data-level={level} key={`h${key++}`}>
          {inline(heading[2], `h${key}`)}
        </div>
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      listItems.push((bullet ?? numbered)![1]);
      continue;
    }

    if (line.trim() === "") {
      flushList();
      continue;
    }

    flushList();
    blocks.push(
      <p className="md-p" key={`p${key++}`}>
        {inline(line, `p${key}`)}
      </p>
    );
  }

  flushList();
  if (codeLines !== null && codeLines.length > 0) {
    blocks.push(
      <pre className="md-pre" key={`c${key++}`}>
        {codeLines.join("\n")}
      </pre>
    );
  }

  return <Fragment>{blocks}</Fragment>;
}
