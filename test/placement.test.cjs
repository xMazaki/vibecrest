const p = require("../electron/placement.cjs");

// Deux écrans côte à côte, comme la configuration réelle.
const D1 = { id: 1, workArea: { x: 0, y: 0, width: 1680, height: 1010 } };
const D2 = { id: 2, workArea: { x: 1680, y: 0, width: 1680, height: 1010 } };

let failures = 0;
function check(label, condition, detail) {
  if (!condition) {
    failures++;
    console.log(`  ECHEC ${label} ${detail ?? ""}`);
  }
}

function inside(bounds, area) {
  return (
    bounds.x >= area.x &&
    bounds.y >= area.y &&
    bounds.x + bounds.width <= area.x + area.width &&
    bounds.y + bounds.height <= area.y + area.height
  );
}

console.log("1. Le conteneur reste dans la zone de travail, tous bords et positions");
for (const edge of ["top", "bottom", "left", "right", "free"]) {
  for (const t of [0, 0.02, 0.25, 0.5, 0.75, 0.98, 1]) {
    for (const display of [D1, D2]) {
      const layout = p.computeLayout({ edge, along: t, x: t, y: t, displayId: display.id }, display);
      check(`${edge} t=${t} ecran=${display.id}`, inside(layout.bounds, display.workArea), JSON.stringify(layout.bounds));
    }
  }
}

console.log("2. L'ancre tombe toujours à l'intérieur du conteneur");
for (const edge of ["top", "bottom", "left", "right", "free"]) {
  for (const t of [0, 0.15, 0.5, 0.85, 1]) {
    const l = p.computeLayout({ edge, along: t, x: t, y: t, displayId: 1 }, D1);
    check(
      `${edge} t=${t} ancre=(${l.anchor.x},${l.anchor.y})`,
      l.anchor.x >= 0 && l.anchor.x <= l.bounds.width && l.anchor.y >= 0 && l.anchor.y <= l.bounds.height
    );
  }
}

/*
 * 3. Continuité : c'est le test qui manquait.
 *
 * Un déplacement d'un pixel de l'ancre ne doit jamais décaler le conteneur de
 * plus d'un pixel. Toute discontinuité se voit comme un saut du pill pendant
 * le déplacement à la souris.
 */
console.log("3. Continuité du déplacement, pas à pas sur toute la largeur et la hauteur");
{
  let worstX = 0;
  let worstAtX = null;
  let previous = null;
  for (let x = 0; x <= D1.workArea.width; x += 1) {
    const cursor = { x, y: 505 };
    const place = p.snapPlacement(cursor, D1);
    const layout = p.computeLayout(place, D1);
    // On ignore la transition libre vers accroché, qui est un accrochage voulu.
    if (previous && previous.edge === layout.edge) {
      const shift = Math.abs(layout.bounds.x - previous.bounds.x);
      if (shift > worstX) {
        worstX = shift;
        worstAtX = x;
      }
    }
    previous = layout;
  }
  check(`saut horizontal maximal ${worstX}px (x=${worstAtX})`, worstX <= 1, "attendu au plus 1px");

  let worstY = 0;
  let worstAtY = null;
  previous = null;
  for (let y = 0; y <= D1.workArea.height; y += 1) {
    const place = p.snapPlacement({ x: 840, y }, D1);
    const layout = p.computeLayout(place, D1);
    if (previous && previous.edge === layout.edge) {
      const shift = Math.abs(layout.bounds.y - previous.bounds.y);
      if (shift > worstY) {
        worstY = shift;
        worstAtY = y;
      }
    }
    previous = layout;
  }
  check(`saut vertical maximal ${worstY}px (y=${worstAtY})`, worstY <= 1, "attendu au plus 1px");
}

console.log("4. Accrochage : près d'un bord on s'y colle, au centre on flotte");
check("haut", p.snapPlacement({ x: 800, y: 12 }, D1).edge === "top");
check("bas", p.snapPlacement({ x: 800, y: 1000 }, D1).edge === "bottom");
check("gauche", p.snapPlacement({ x: 20, y: 500 }, D1).edge === "left");
check("droite", p.snapPlacement({ x: 1665, y: 500 }, D1).edge === "right");
check("centre reste flottant", p.snapPlacement({ x: 800, y: 500 }, D1).edge === "free");
check("a 100px du bord on flotte encore", p.snapPlacement({ x: 800, y: 100 }, D1).edge === "free");
check("coin choisit un bord", ["top", "left"].includes(p.snapPlacement({ x: 10, y: 30 }, D1).edge));

console.log("5. Passage sur le second écran");
const onD2 = p.snapPlacement({ x: 2500, y: 8 }, D2);
check("bord haut de l'ecran 2", onD2.edge === "top" && onD2.displayId === 2);
check("conteneur sur l'ecran 2", inside(p.computeLayout(onD2, D2).bounds, D2.workArea));

console.log("6. Valeurs aberrantes");
check("ancrage inconnu retombe sur le haut", p.normalize({ edge: "diagonal" }).edge === "top");
check("fraction hors bornes ramenee", p.normalize({ along: 5 }).along === 1);
check("configuration absente donne un defaut", p.normalize(undefined).edge === "top");

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
