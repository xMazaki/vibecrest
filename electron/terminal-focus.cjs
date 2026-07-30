"use strict";

const { execFile } = require("child_process");
const path = require("path");

/**
 * Liste fermée des hôtes que l'on sait viser. Le nom passé à PowerShell ne
 * peut venir que d'ici, jamais d'une donnée reçue du hook.
 */
const KNOWN_HOSTS = new Set([
  "Code",
  "Code - Insiders",
  "Cursor",
  "Windsurf",
  "VSCodium",
  "WindowsTerminal",
  "wezterm-gui",
  "alacritty",
  "ConEmu64",
]);

/**
 * Remet au premier plan la fenêtre du terminal qui héberge une session.
 *
 * Le PID est validé comme entier avant d'être passé à PowerShell via -File,
 * donc en argument et non par concaténation dans une commande. C'est la
 * différence avec le motif -Command "...$titre..." que l'on trouve ailleurs,
 * lequel permet une évasion de chaîne dès qu'un titre contient une apostrophe.
 */
function focusByPid(pid, scriptPath, preferProcess) {
  return new Promise((resolve) => {
    const target = Number(pid);
    if (!Number.isInteger(target) || target <= 4) {
      return resolve({ ok: false, reason: "Processus du terminal inconnu" });
    }

    const prefer = KNOWN_HOSTS.has(preferProcess) ? preferProcess : "";

    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-StartPid",
        String(target),
        "-PreferProcess",
        prefer,
      ],
      { timeout: 9000, windowsHide: true },
      (err, stdout) => {
        const [status, window, chain, rawPids] = String(stdout || "").trim().split("|");
        const pids = String(rawPids || "")
          .split(",")
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isInteger(value) && value > 0);

        if (status === "OK") {
          return resolve({ ok: true, window, chain, pids });
        }
        if (status === "REFUSED") {
          return resolve({
            ok: false,
            window,
            chain,
            pids,
            reason: `Windows a refusé d'activer ${window || "la fenêtre"}. Chaîne : ${chain || "inconnue"}`,
          });
        }
        if (status === "NOWINDOW") {
          return resolve({
            ok: false,
            chain,
            pids,
            reason: `Aucune fenêtre dans la chaîne : ${chain || "vide"}`,
          });
        }
        return resolve({
          ok: false,
          reason: err?.killed
            ? "Le retour au terminal a expiré"
            : "Échec du retour au terminal, sortie inattendue",
        });
      }
    );
  });
}

function resolveScriptPath(app) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "focus-window.ps1")
    : path.join(__dirname, "focus-window.ps1");
}

module.exports = { focusByPid, resolveScriptPath, KNOWN_HOSTS };
