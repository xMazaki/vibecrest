/**
 * Image d'illustration du dépôt.
 *
 * Compose quelques états réels du panneau à partir de la feuille de style
 * compilée, sans les étiquettes du banc de développement, et écrit
 * docs/hero.png.
 *
 *   npm run build && npm run hero
 */

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs");
const OUT = path.join(OUT_DIR, "hero.png");

function builtCss() {
  const dir = path.join(ROOT, "dist", "assets");
  const file = fs.readdirSync(dir).find((name) => name.endsWith(".css"));
  if (!file) throw new Error("Aucune feuille compilée. Lancez npm run build d'abord.");
  return fs.readFileSync(path.join(dir, file), "utf8");
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${builtCss()}
body {
  margin: 0;
  padding: 46px 52px;
  background:
    radial-gradient(120% 90% at 50% 0%, #1a1713 0%, #0a0908 62%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
}
.crest { position: relative; }
.row-of { display: flex; align-items: flex-start; gap: 26px; }
</style></head><body>

<div class="crest" data-mode="compact" data-edge="free">
  <div class="compact">
    <span class="dot" data-status="working"></span>
    <span class="name">vibecrest</span>
    <span class="detail">Edit</span>
    <span class="elapsed">1m42</span>
  </div>
</div>

<div class="row-of">
  <div class="crest" data-mode="expanded" data-edge="free">
    <div class="panel" style="width:430px">
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
      <div class="detail-head">
        <span class="dot" data-status="attention"></span>
        <span class="detail-title">vibecrest</span>
        <span class="detail-meta">14 appels</span>
        <span class="detail-meta">VS Code</span>
        <span style="flex:1"></span>
        <span class="detail-meta">4m08</span>
      </div>
      <div class="feed">
        <div class="feed-row" data-state="done" data-kind="tool"><span class="feed-time">10:12:04</span><span class="feed-tool">Read</span><span class="feed-detail">components/Crest.tsx</span><span class="feed-meta">412ms</span></div>
        <div class="feed-row" data-state="done" data-kind="subagent"><span class="feed-time">10:12:09</span><span class="feed-tool">sous-agent</span><span class="feed-detail">auditer la feuille de style</span><span class="feed-meta">18s</span></div>
        <div class="feed-row" data-state="running" data-kind="tool"><span class="feed-time">10:12:31</span><span class="feed-tool">Bash</span><span class="feed-detail">npm run build</span><span class="feed-meta">en cours</span></div>
        <div class="feed-row" data-state="pending" data-kind="tool"><span class="feed-time">10:12:44</span><span class="feed-tool">Edit</span><span class="feed-detail">components/PermissionCard.tsx</span><span class="feed-meta">à valider</span></div>
      </div>
      <div class="foot">
        <span class="grip"><i></i><i></i><i></i></span>
        <span class="keyhint"><kbd>A</kbd> approuver <kbd>R</kbd> refuser <kbd>T</kbd> toujours</span>
        <span class="spacer" style="flex:1"></span>
      </div>
    </div>
  </div>

  <div class="crest" data-mode="compact" data-edge="left" style="align-self:center">
    <div class="compact">
      <span class="dot" data-status="attention"></span>
      <span class="name">api</span>
      <span class="detail">Bash</span>
      <span class="elapsed">12s</span>
    </div>
  </div>
</div>

</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    backgroundColor: "#0a0908",
  });

  const page = path.join(app.getPath("temp"), "vibe-crest-hero.html");
  fs.writeFileSync(page, html, "utf8");
  await win.loadFile(page);
  await new Promise((resolve) => setTimeout(resolve, 700));

  const size = await win.webContents.executeJavaScript(
    "JSON.stringify([Math.ceil(document.body.scrollWidth), Math.ceil(document.body.scrollHeight)])"
  );
  const [w, h] = JSON.parse(size);
  win.setContentSize(Math.min(w, 1400), Math.min(h, 1200));
  await new Promise((resolve) => setTimeout(resolve, 300));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, (await win.webContents.capturePage()).toPNG());
  console.log(`Illustration écrite dans ${OUT}`);
  app.quit();
});
