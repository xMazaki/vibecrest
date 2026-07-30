/**
 * Banc de rendu d'une vue complète.
 *
 * Charge le vrai composant depuis le paquet compilé, avec un pont doublé qui
 * fournit un état choisi, puis capture. Contrairement à une maquette recopiée,
 * ce qui est jugé ici est exactement ce qui s'exécutera.
 *
 *   npm run build
 *   npm run preview:view -- usage 430 548
 *   npm run preview:view -- onboarding 560 680
 */

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// Lancé par l'exécutable Electron, argv contient le chemin du script en
// deuxième position ; empaqueté, il n'y est pas.
const args = process.argv.slice(process.defaultApp ? 2 : 1);
const route = args[0] || "usage";
const width = Number(args[1]) || 430;
const height = Number(args[2]) || 548;
const OUT = path.join(ROOT, `preview-${route}.png`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    backgroundColor: "#0a0908",
    webPreferences: {
      preload: path.join(__dirname, "preview-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.join(ROOT, "dist", "index.html"), { hash: route });
  await new Promise((resolve) => setTimeout(resolve, 900));

  // La capture se limite à la zone visible : on ajuste la fenêtre à la hauteur
  // réelle du contenu pour ne rien tronquer.
  const measured = await win.webContents.executeJavaScript(
    "Math.ceil(document.body.scrollHeight)"
  );
  win.setContentSize(width, Math.min(Math.max(measured + 4, 300), 1600));
  await new Promise((resolve) => setTimeout(resolve, 300));

  fs.writeFileSync(OUT, (await win.webContents.capturePage()).toPNG());
  console.log(`Rendu écrit dans ${OUT}`);
  app.quit();
});
