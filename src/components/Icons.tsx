/**
 * Jeu d'icônes dessiné à la main, en traits de 1.5 px sur une grille de 16.
 * Pas de librairie généraliste : chaque glyphe correspond à une action réelle
 * de l'interface, et rien de décoratif ne vient s'y ajouter.
 */

interface Props {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconCheck({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

export function IconCross({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Flèche sortant d'un cadre : revenir à la fenêtre du terminal. */
export function IconJump({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M9.5 2.5H13.5V6.5" />
      <path d="M13.5 2.5 8 8" />
      <path d="M11.5 9.5V13.5H2.5V4.5H6.5" />
    </svg>
  );
}

/** Curseurs horizontaux, plus lisibles qu'un engrenage à cette taille. */
export function IconSliders({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M2 5h4M9 5h5M2 11h7M12 11h2" />
      <circle cx="7.5" cy="5" r="1.6" />
      <circle cx="10.5" cy="11" r="1.6" />
    </svg>
  );
}

export function IconClose({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

/** Trois barres de hauteurs inégales : la consommation. */
export function IconGauge({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M3.5 12.5V8.5M8 12.5V3.5M12.5 12.5V6.5" />
    </svg>
  );
}

/** Flèche circulaire ouverte : recalculer. */
export function IconRefresh({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13.2 2.6V5.2H10.6" />
    </svg>
  );
}

/** Chevron haut : le panneau se rétracte vers le bord supérieur de l'écran. */
export function IconCollapse({ size = 14 }: Props) {
  return (
    <svg {...base(size)} aria-hidden="true">
      <path d="M4 10 8 6 12 10" />
    </svg>
  );
}
