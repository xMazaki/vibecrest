"use strict";

/**
 * Géométrie du pill.
 *
 * Modèle : le pill possède un point d'ancrage qui ne bouge pas quand il se
 * déploie. Selon l'ancrage, le panneau s'ouvre vers le bas, le haut, la droite
 * ou la gauche. La fenêtre Electron n'est pas le pill lui-même mais la région
 * dans laquelle le pill peut grandir, ce qui évite de redimensionner la fenêtre
 * à chaque changement d'état, source de scintillement sous Windows.
 *
 * Le conteneur est toujours centré sur l'ancre puis ramené dans la zone de
 * travail. Ce rognage est ce qui garantit qu'un panneau ouvert dans un coin ne
 * sort jamais de l'écran, et il le fait de façon progressive, contrairement à
 * un basculement d'alignement qui déplacerait le pill d'un bloc.
 */

/** Enveloppe maximale d'un panneau déployé, marges comprises. */
const PANEL_MAX_W = 520;
const PANEL_MAX_H = 560;

/** Distance au bord en deçà de laquelle le pill s'y accroche. */
const SNAP_DISTANCE = 72;

const DEFAULT_PLACEMENT = {
  edge: "top",
  /** Position le long du bord, en fraction de la zone de travail. */
  along: 0.5,
  /** Position libre, en fraction de la zone de travail. */
  x: 0.5,
  y: 0.15,
  displayId: null,
};

const EDGES = ["top", "bottom", "left", "right"];

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function normalize(placement) {
  const base = { ...DEFAULT_PLACEMENT, ...(placement || {}) };
  if (base.edge !== "free" && !EDGES.includes(base.edge)) base.edge = "top";
  base.along = clamp(Number(base.along) || 0, 0, 1);
  base.x = clamp(Number(base.x) || 0, 0, 1);
  base.y = clamp(Number(base.y) || 0, 0, 1);
  return base;
}

/** Point d'ancrage du pill, en coordonnées écran. */
function anchorPoint(placement, display) {
  const p = normalize(placement);
  const area = display.workArea;
  switch (p.edge) {
    case "top":
      return { x: area.x + p.along * area.width, y: area.y };
    case "bottom":
      return { x: area.x + p.along * area.width, y: area.y + area.height };
    case "left":
      return { x: area.x, y: area.y + p.along * area.height };
    case "right":
      return { x: area.x + area.width, y: area.y + p.along * area.height };
    default:
      return { x: area.x + p.x * area.width, y: area.y + p.y * area.height };
  }
}

/**
 * Calcule les limites de la fenêtre conteneur et la position de l'ancre à
 * l'intérieur de celle-ci, exprimée en pixels CSS.
 *
 * Le conteneur est toujours centré sur l'ancre, puis ramené dans la zone de
 * travail. Ce centrage systématique est ce qui rend le déplacement continu :
 * une version antérieure basculait l'alignement selon la place disponible, et
 * ce basculement décalait le pill d'une demi-largeur d'un seul coup, à bonne
 * distance du bord. Le rognage aux limites de l'écran, lui, est progressif.
 */
function computeLayout(placement, display) {
  const p = normalize(placement);
  const area = display.workArea;
  const anchor = anchorPoint(p, display);

  const width = Math.min(PANEL_MAX_W, area.width);
  const height = Math.min(PANEL_MAX_H, area.height);

  const left = clamp(anchor.x - width / 2, area.x, area.x + area.width - width);
  const top = clamp(anchor.y - height / 2, area.y, area.y + area.height - height);

  const bounds = {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };

  return {
    bounds,
    anchor: { x: Math.round(anchor.x - bounds.x), y: Math.round(anchor.y - bounds.y) },
    edge: p.edge,
    placement: p,
  };
}

/**
 * Détermine l'ancrage résultant d'une position de pointeur pendant un
 * déplacement : accrochage au bord le plus proche s'il est assez près, sinon
 * position libre.
 */
function snapPlacement(anchor, display) {
  const area = display.workArea;
  const distances = {
    top: anchor.y - area.y,
    bottom: area.y + area.height - anchor.y,
    left: anchor.x - area.x,
    right: area.x + area.width - anchor.x,
  };

  let edge = null;
  let best = SNAP_DISTANCE;
  for (const candidate of EDGES) {
    if (distances[candidate] < best) {
      best = distances[candidate];
      edge = candidate;
    }
  }

  const fx = clamp((anchor.x - area.x) / area.width, 0, 1);
  const fy = clamp((anchor.y - area.y) / area.height, 0, 1);

  if (!edge) {
    return { edge: "free", along: 0.5, x: fx, y: fy, displayId: display.id };
  }

  const along = edge === "top" || edge === "bottom" ? fx : fy;
  return { edge, along, x: fx, y: fy, displayId: display.id };
}

/** Libellé lisible de l'ancrage, pour la fenêtre de réglages. */
function describe(placement) {
  const p = normalize(placement);
  switch (p.edge) {
    case "top":
      return "Accroché en haut";
    case "bottom":
      return "Accroché en bas";
    case "left":
      return "Accroché à gauche";
    case "right":
      return "Accroché à droite";
    default:
      return "Flottant";
  }
}

module.exports = {
  DEFAULT_PLACEMENT,
  PANEL_MAX_W,
  PANEL_MAX_H,
  SNAP_DISTANCE,
  normalize,
  anchorPoint,
  computeLayout,
  snapPlacement,
  describe,
};
