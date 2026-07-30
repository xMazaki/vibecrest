const vscode = require("vscode");

/**
 * Extension compagnon de Vibe Crest.
 *
 * Windows n'expose aucun moyen de donner le focus à un onglet précis d'un
 * terminal : au mieux on active la fenêtre. À l'intérieur de VS Code en
 * revanche, l'API des terminaux permet de viser le bon panneau. Vibe Crest
 * active donc la fenêtre par les fonctions Win32, puis ouvre une URI que cette
 * extension intercepte pour finir le travail.
 *
 * URI attendue :
 *   vscode://vibecrest.terminal-focus/focus?pids=1234,5678
 *
 * Les identifiants transmis sont la chaîne des processus parents relevée par
 * Vibe Crest. Le shell d'un terminal intégré s'y trouve forcément, et c'est lui
 * que l'API expose : il suffit donc de chercher une correspondance.
 */

let lastPids = [];

async function focusMatchingTerminal(pids) {
  if (!pids.length) return false;
  const wanted = new Set(pids);

  for (const terminal of vscode.window.terminals) {
    let pid;
    try {
      pid = await terminal.processId;
    } catch {
      continue;
    }
    if (pid && wanted.has(pid)) {
      // show() sans argument donne le focus au terminal, ce que l'on veut :
      // l'utilisateur vient de demander à y revenir.
      terminal.show();
      return true;
    }
  }
  return false;
}

function parsePids(query) {
  return new URLSearchParams(query)
    .get("pids")
    ?.split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0) ?? [];
}

function activate(context) {
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri) {
        const pids = parsePids(uri.query);
        lastPids = pids;

        if (await focusMatchingTerminal(pids)) return;

        // Aucune correspondance : la session vit peut-être dans une autre
        // fenêtre, ou hors d'un terminal intégré. On se contente alors de
        // révéler le panneau, ce qui reste plus utile que de ne rien faire.
        await vscode.commands.executeCommand("workbench.action.terminal.focus");
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vibeCrest.focusLastTerminal", async () => {
      if (!(await focusMatchingTerminal(lastPids))) {
        vscode.window.showInformationMessage(
          "Vibe Crest : aucun terminal de cette fenêtre ne correspond à la dernière session ciblée."
        );
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
