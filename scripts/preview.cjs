/**
 * Banc de rendu du pill.
 *
 * Affiche les états du pill hors application, à partir de la feuille de style
 * réellement compilée, et capture le résultat dans preview.png.
 *
 * Utilité : une capture d'écran de l'application dépend de l'état des sessions
 * et de la position du curseur, deux choses qu'on ne contrôle pas pendant le
 * développement. Ce banc est déterministe et permet de juger une modification
 * de style sans avoir à provoquer l'état correspondant dans l'application.
 *
 *   npm run build && npm run preview
 */

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "preview.png");

function builtCss() {
  const dir = path.join(ROOT, "dist", "assets");
  const file = fs.readdirSync(dir).find((name) => name.endsWith(".css"));
  if (!file) throw new Error("Aucune feuille compilée. Lancez npm run build d'abord.");
  return fs.readFileSync(path.join(dir, file), "utf8");
}

const compact = (edge) => `
  <div class="cell">
    <div class="tag">${edge}</div>
    <div class="crest" data-mode="compact" data-edge="${edge}">
      <div class="compact">
        <span class="dot" data-status="working"></span>
        <span class="name">winclaude</span>
        <span class="detail">Edit</span>
        <span class="elapsed">2m14</span>
      </div>
    </div>
  </div>`;

const dormant = (edge) => `
  <div class="cell">
    <div class="tag">${edge} au repos</div>
    <div class="crest" data-mode="dormant" data-edge="${edge}"><div class="sliver"></div></div>
  </div>`;

const buttons = `
  <div class="cell">
    <div class="tag">actions</div>
    <div class="crest" data-mode="expanded" data-edge="free">
      <div class="panel" style="width:340px">
        <div class="card" data-kind="permission">
          <div class="card-head">
            <span class="dot" data-status="attention"></span>
            <span class="card-tool">Bash</span>
            <span class="card-where">~/Desktop/NodeJS/winclaude</span>
          </div>
          <div class="card-body">npm run build &amp;&amp; npm run dist</div>
          <div class="card-actions">
            <button class="btn" data-tone="primary">Approuver</button>
            <button class="btn" data-tone="quiet">Toujours</button>
            <span style="flex:1"></span>
            <button class="btn" data-tone="quiet">Refuser</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

const question = `
  <div class="cell">
    <div class="tag">question</div>
    <div class="crest" data-mode="expanded" data-edge="free">
      <div class="panel" style="width:360px">
        <div class="card" data-kind="question">
          <div class="card-head">
            <span class="dot" data-status="question"></span>
            <span class="card-tool">Question</span>
            <span class="card-where">winclaude</span>
          </div>
          <div class="question-block">
            <div class="question-header">Approche</div>
            <div class="question-title">Quelle stratégie pour le cache ?</div>
            <div class="option-list" data-stacked="true">
              <button class="option"><span class="option-body"><span class="option-label">Invalidation par clé</span><span class="option-desc">Précis, mais demande de suivre les dépendances.</span></span></button>
              <button class="option" data-picked="true"><span class="option-body"><span class="option-label">Durée de vie courte</span><span class="option-desc">Simple, au prix de quelques recalculs.</span></span></button>
              <button class="option" data-other="true"><span class="option-body"><span class="option-label">Autre</span></span></button>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn" data-tone="primary">Répondre</button>
            <button class="btn" data-tone="quiet">Au terminal</button>
          </div>
        </div>
        <div class="foot">
          <span class="grip"><i></i><i></i><i></i></span>
          <span class="badge" data-tone="queue">2 à valider</span>
          <span class="spacer" style="flex:1"></span>
        </div>
      </div>
    </div>
  </div>`;

const diffCard = `
  <div class="cell">
    <div class="tag">apercu : modification</div>
    <div class="crest" data-mode="expanded" data-edge="free">
      <div class="panel" style="width:420px">
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
              <div class="diff-row" data-sign=" "><span class="diff-gutter"> </span><span class="diff-text">};</span></div>
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
      </div>
    </div>
  </div>`;

const planCard = `
  <div class="cell">
    <div class="tag">apercu : plan</div>
    <div class="crest" data-mode="expanded" data-edge="free">
      <div class="panel" style="width:400px">
        <div class="card" data-kind="permission">
          <div class="card-head">
            <span class="dot" data-status="attention"></span>
            <span class="card-tool">ExitPlanMode</span>
            <span class="card-where">Plan proposé</span>
          </div>
          <div class="preview">
            <div class="preview-md">
              <div class="md-heading" data-level="2">Refonte de l'aperçu</div>
              <p class="md-p">Trois étapes, sans toucher au protocole.</p>
              <ul class="md-list">
                <li>Construire la différence dans <code class="md-code">preview.cjs</code></li>
                <li>Rendre le Markdown sans injection HTML</li>
                <li>Replier les plages inchangées</li>
              </ul>
              <pre class="md-pre">npm run build &amp;&amp; npm run preview</pre>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn" data-tone="primary">Approuver</button>
            <span style="flex:1"></span>
            <button class="btn" data-tone="quiet">Refuser</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

const multiQuestion = `
  <div class="cell">
    <div class="tag">question a reponses multiples</div>
    <div class="crest" data-mode="expanded" data-edge="free">
      <div class="panel" style="width:380px">
        <div class="card" data-kind="question">
          <div class="card-head">
            <span class="dot" data-status="question"></span>
            <span class="card-tool">Question</span>
            <span class="card-where">winclaude</span>
          </div>
          <div class="question-block">
            <div class="question-header">Périmètre</div>
            <div class="question-title">Quels agents faut-il prendre en charge ?</div>
            <div class="question-note">Plusieurs réponses possibles</div>
            <div class="option-list" data-stacked="true">
              <button class="option" data-picked="true">
                <span class="option-mark"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg></span>
                <span class="option-body"><span class="option-label">Gemini CLI</span><span class="option-desc">Hooks proches de Claude Code.</span></span>
              </button>
              <button class="option">
                <span class="option-mark"></span>
                <span class="option-body"><span class="option-label">OpenCode</span><span class="option-desc">Système de greffons en JavaScript.</span></span>
              </button>
              <button class="option" data-picked="true" data-other="true">
                <span class="option-mark"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg></span>
                <span class="option-body"><span class="option-label">Autre</span></span>
              </button>
            </div>
            <input class="other-input" value="Amp, si l'API le permet" />
          </div>
          <div class="card-actions">
            <button class="btn" data-tone="primary">Répondre</button>
            <button class="btn" data-tone="quiet">Au terminal</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

const attention = (level) => `
  <div class="cell">
    <div class="tag">insistance : ${level}</div>
    <div class="crest" data-mode="compact" data-edge="free" data-attention="${level}">
      <div class="compact">
        <span class="dot" data-status="attention"></span>
        <span class="name">winclaude</span>
        <span class="detail">Bash à valider</span>
        <span class="elapsed">42s</span>
      </div>
    </div>
  </div>`;

const chrome = `
  <div class="cell">
    <div class="tag">journal replié, touches, focus</div>
    <div class="crest" data-mode="expanded" data-edge="free">
      <div class="panel" style="width:400px">
        <button class="feed-toggle">
          <span class="feed-toggle-text">7 étapes avant celle-ci</span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10 8 6 12 10"/></svg>
        </button>
        <div style="display:flex;gap:8px;padding-top:4px">
          <button class="btn" data-tone="primary" style="outline:2px solid var(--bone);outline-offset:2px">Focus clavier</button>
          <button class="btn" data-tone="quiet">Sans focus</button>
        </div>
        <div class="foot">
          <span class="grip"><i></i><i></i><i></i></span>
          <span class="keyhint"><kbd>A</kbd> approuver <kbd>R</kbd> refuser <kbd>T</kbd> toujours</span>
          <span class="spacer" style="flex:1"></span>
        </div>
      </div>
    </div>
  </div>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${builtCss()}
body { background:#141416; padding:26px; display:flex; gap:34px; align-items:flex-start; flex-wrap:wrap; overflow:visible; }
.cell { display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
.tag { font-family: var(--mono); font-size:11px; color:#8a8378; }
/* Dans l'application le pill est positionné au pixel par rapport à son ancre.
   Sur le banc il n'y a pas d'ancre : on le remet dans le flux. Il faut garder
   position:relative et non static, sinon la couche de grain, absolue et calée
   sur inset:0, prend pour référence le document entier. */
.cell .crest { position: relative; }
</style></head><body>
${compact("top")}
${compact("left")}
${compact("right")}
${compact("free")}
${dormant("left")}
${dormant("free")}
${buttons}
${question}
${diffCard}
${planCard}
${attention("soft")}
${attention("strong")}
${multiQuestion}
${chrome}
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1040,
    height: 760,
    show: false,
    backgroundColor: "#141416",
  });

  // Fichier plutôt qu'URL data : l'encodage d'une feuille de style entière
  // gonfle l'URL et Chromium finit par la tronquer en silence, ce qui coupe le
  // document au milieu d'une balise.
  const page = path.join(app.getPath("temp"), "vibe-crest-preview.html");
  fs.writeFileSync(page, html, "utf8");
  await win.loadFile(page);
  await new Promise((resolve) => setTimeout(resolve, 500));

  // La capture se limite à la zone visible : on redimensionne la fenêtre à la
  // hauteur réelle du document, sans quoi le bas du banc serait tronqué.
  const height = await win.webContents.executeJavaScript(
    "Math.ceil(document.body.scrollHeight) + 20"
  );
  const [width] = win.getContentSize();
  win.setContentSize(width, Math.min(Math.max(height, 300), 4000));
  await new Promise((resolve) => setTimeout(resolve, 300));

  fs.writeFileSync(OUT, (await win.webContents.capturePage()).toPNG());
  console.log(`Rendu écrit dans ${OUT}`);
  app.quit();
});
