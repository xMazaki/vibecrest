/**
 * Visuel de présentation, format 16:9 pour les réseaux.
 *
 * Composé à partir de la feuille de style réellement compilée, de sorte que ce
 * qui est montré correspond à ce qui s'affiche. Rendu à 2400x1350 pour rester
 * net après la recompression des plateformes.
 *
 *   npm run build && npm run social
 */

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs");
const OUT = path.join(OUT_DIR, "social.png");

/**
 * Format 16:9 attendu par les réseaux. La composition est agrandie pour que le
 * texte reste lisible une fois l'image réduite dans un fil, ce qu'un rendu à
 * taille native ne permettrait pas : les corps de 11 à 13 pixels de
 * l'application y deviendraient illisibles.
 */
const W = 1200;
const H = 675;
const SCALE = 1.02;
const PAD = 34;

function builtCss() {
  const dir = path.join(ROOT, "dist", "assets");
  const file = fs.readdirSync(dir).find((name) => name.endsWith(".css"));
  if (!file) throw new Error("Aucune feuille compilée. Lancez npm run build d'abord.");
  return fs.readFileSync(path.join(dir, file), "utf8");
}

/* Les deux états de repos du pill, montrés côte à côte : replié il ne dit rien
   et ne gêne rien, déployé d'un cran il annonce l'essentiel en une ligne. */
const pill = `
<div class="states">
  <div class="state-item">
    <span class="state-caption">replié</span>
    <div class="crest" data-mode="dormant" data-edge="free"><div class="sliver"></div></div>
  </div>
  <div class="state-item">
    <span class="state-caption">au repos</span>
    <div class="crest" data-mode="compact" data-edge="free">
      <div class="compact">
        <span class="dot" data-status="working"></span>
        <span class="name">vibecrest</span>
        <span class="detail">Edit</span>
        <span class="elapsed">1m42</span>
        <span class="badge">2</span>
      </div>
    </div>
  </div>
</div>`;

const permission = `
<div class="crest" data-mode="expanded" data-edge="free">
  <div class="panel" style="width:486px">
    <div class="card" data-kind="permission">
      <div class="card-head">
        <span class="dot" data-status="attention"></span>
        <span class="card-tool">Edit</span>
        <span class="card-where">components/PermissionCard.tsx</span>
      </div>
      <div class="preview">
        <div class="diff">
          <div class="diff-row" data-sign=" "><span class="diff-gutter"> </span><span class="diff-text">const decide = (decision) =&gt; {</span></div>
          <div class="diff-row" data-sign="-"><span class="diff-gutter">-</span><span class="diff-text">  if (sent) return;</span></div>
          <div class="diff-row" data-sign="+"><span class="diff-gutter">+</span><span class="diff-text">  if (sent || !pending) return;</span></div>
          <div class="diff-row" data-sign="+"><span class="diff-gutter">+</span><span class="diff-text">  setSent(true);</span></div>
          <div class="diff-row" data-sign=" "><span class="diff-gutter"> </span><span class="diff-text">  onDecide(pending.requestId, decision);</span></div>
          <div class="diff-row" data-sign="~"><span class="diff-gutter"></span><span class="diff-text">12 lignes inchangées</span></div>
        </div>
        <div class="diff-tally"><span data-sign="+">2 ajoutées</span><span data-sign="-">1 retirée</span></div>
      </div>
      <div class="card-actions">
        <button class="btn" data-tone="primary">Approuver</button>
        <button class="btn" data-tone="quiet">Toujours</button>
        <span style="flex:1"></span>
        <button class="btn" data-tone="quiet">Refuser</button>
      </div>
    </div>
    <div class="feed">
      <div class="feed-row" data-state="done" data-kind="tool"><span class="feed-time">10:12:04</span><span class="feed-tool">Read</span><span class="feed-detail">components/Crest.tsx</span><span class="feed-meta">412ms</span></div>
      <div class="feed-row" data-state="done" data-kind="subagent"><span class="feed-time">10:12:09</span><span class="feed-tool">sous-agent</span><span class="feed-detail">auditer la feuille de style</span><span class="feed-meta">18s</span></div>
      <div class="feed-row" data-state="pending" data-kind="tool"><span class="feed-time">10:12:44</span><span class="feed-tool">Edit</span><span class="feed-detail">components/PermissionCard.tsx</span><span class="feed-meta">à valider</span></div>
    </div>
    <div class="foot">
      <span class="grip"><i></i><i></i><i></i></span>
      <span class="keyhint"><kbd>A</kbd> approuver <kbd>R</kbd> refuser <kbd>T</kbd> toujours</span>
      <span class="spacer" style="flex:1"></span>
    </div>
  </div>
</div>`;

const check = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>`;

const question = `
<div class="crest" data-mode="expanded" data-edge="free">
  <div class="panel" style="width:410px">
    <div class="card" data-kind="question">
      <div class="card-head">
        <span class="dot" data-status="question"></span>
        <span class="card-tool">Question</span>
        <span class="card-where">vibecrest</span>
      </div>
      <div class="question-block">
        <div class="question-header">Approche</div>
        <div class="question-title">Comment procéder pour la migration ?</div>
        <div class="option-list" data-stacked="true">
          <button class="option" data-picked="true"><span class="option-mark">${check}</span><span class="option-body"><span class="option-label">Étape par étape</span></span></button>
          <button class="option"><span class="option-mark"></span><span class="option-body"><span class="option-label">Tout d'un coup</span></span></button>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn" data-tone="primary">Répondre</button>
        <button class="btn" data-tone="quiet">Au terminal</button>
      </div>
    </div>
  </div>
</div>`;

const usage = `
<div class="usage-panel" style="width:410px;height:auto;overflow:visible">
  <div class="u-head">
    <span class="u-title">Consommation</span>
    <span style="flex:1"></span>
  </div>
  <div class="u-hero">
    <span class="u-hero-value">1.98 M</span>
    <span class="u-hero-unit">jetons consommés<br>sur 5 heures</span>
    <span class="u-hero-turns">508 tours</span>
  </div>
  <div class="u-bar">
    <span class="u-seg" data-tone="output" style="flex-grow:892"></span>
    <span class="u-seg" data-tone="input" style="flex-grow:1"></span>
    <span class="u-seg" data-tone="cache-write" style="flex-grow:1090"></span>
  </div>
  <div class="u-legend">
    <span class="u-legend-item"><span class="u-chip" data-tone="output"></span><span class="u-legend-label">sortie</span><span class="u-legend-value">892 k</span></span>
    <span class="u-legend-item"><span class="u-chip" data-tone="input"></span><span class="u-legend-label">entrée</span><span class="u-legend-value">1.0 k</span></span>
    <span class="u-legend-item"><span class="u-chip" data-tone="cache-write"></span><span class="u-legend-label">cache écrit</span><span class="u-legend-value">1.09 M</span></span>
    <span class="u-legend-item"><span class="u-chip" data-tone="cache-read"></span><span class="u-legend-label">cache lu</span><span class="u-legend-value">223.5 M</span></span>
  </div>
  <div class="u-block">
    <div class="u-block-head">
      <span class="u-block-title">Fenêtre glissante</span>
      <span class="u-block-value">se dégage à 16:54</span>
    </div>
    <div class="u-meter"><span class="u-meter-fill" style="width:64%"></span></div>
  </div>
</div>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${builtCss()}
body {
  margin: 0;
  width: ${W}px;
  height: ${H}px;
  overflow: hidden;
  background:
    radial-gradient(85% 70% at 20% 4%, #241d16 0%, transparent 58%),
    radial-gradient(72% 62% at 94% 98%, #1e1a23 0%, transparent 56%),
    #080706;
  font-family: var(--ui-text);
}
/* La composition est écrite à taille native puis mise à l'échelle d'un bloc :
   les proportions de l'application restent exactes. */
.frame {
  position: absolute;
  top: ${PAD}px;
  left: ${PAD}px;
  width: ${Math.round((W - PAD * 2) / SCALE)}px;
  height: ${Math.round((H - PAD * 2) / SCALE)}px;
  transform: scale(${SCALE});
  transform-origin: top left;
  display: flex;
  flex-direction: column;
}
.head { display: flex; align-items: flex-end; gap: 16px; padding-bottom: 22px; }
.brand {
  font-family: var(--ui-display);
  font-variation-settings: "opsz" 44;
  font-size: 26px; font-weight: 650; letter-spacing: -0.028em; color: var(--text);
}
.tag {
  font-family: var(--ui-text);
  font-size: 14px; line-height: 1.35; color: var(--text-2); max-width: 52ch; padding-bottom: 2px;
}
.repo {
  margin-left: auto;
  font-family: var(--mono); font-size: 12px; color: var(--text-3); padding-bottom: 3px;
}
.cols { display: flex; gap: 26px; align-items: flex-start; }
.states { display: flex; align-items: flex-start; gap: 22px; }
.state-item { display: flex; flex-direction: column; gap: 7px; }
.state-caption {
  font-family: var(--ui-small);
  font-variation-settings: "opsz" 8;
  font-size: 10px; font-weight: 650; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--text-3); padding-left: 2px;
}
.col { display: flex; flex-direction: column; gap: 20px; }
.crest, .usage-panel { position: relative; }
</style></head><body>
<div class="frame">

<div class="head">
  <span class="brand">Vibe Crest</span>
  <span class="tag">Vos agents Claude Code, à portée de regard.</span>
  <span class="repo">github.com/xMazaki/vibecrest</span>
</div>

<div class="cols">
  <div class="col">
    ${pill}
    ${permission}
  </div>
  <div class="col">
    ${usage}
    ${question}
  </div>
</div>

</div>
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    backgroundColor: "#080706",
  });

  const page = path.join(app.getPath("temp"), "vibe-crest-social.html");
  fs.writeFileSync(page, html, "utf8");
  await win.loadFile(page);
  await new Promise((resolve) => setTimeout(resolve, 900));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, (await win.webContents.capturePage()).toPNG());
  console.log(`Visuel écrit dans ${OUT} (${W}x${H})`);
  app.quit();
});
