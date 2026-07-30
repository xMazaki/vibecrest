<div align="center">

# Vibe Crest

**Supervisez vos sessions Claude Code depuis un panneau posé sur le bord de l'écran.**

Voyez ce que fait l'agent, approuvez ses actions sans changer de fenêtre,
revenez au bon terminal d'un clic. Codex signale ses fins de tour.

*Alternative Windows, libre et gratuite, à [Vibe Island](https://vibeisland.app).*

<br>

[![English](https://img.shields.io/badge/Read_in-English-ece7dd?style=for-the-badge&labelColor=1c1a17)](README-EN.md)

<br>

![Electron](https://img.shields.io/badge/Electron-1c1a17?style=for-the-badge&logo=electron&logoColor=9FEAF9)
![React](https://img.shields.io/badge/React_19-1c1a17?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-1c1a17?style=for-the-badge&logo=typescript&logoColor=3178C6)
![Vite](https://img.shields.io/badge/Vite-1c1a17?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Windows](https://img.shields.io/badge/Windows-1c1a17?style=for-the-badge&logo=windows11&logoColor=0078D4)
![MIT](https://img.shields.io/badge/MIT-1c1a17?style=for-the-badge)

<br>

<img src="docs/hero.png" alt="Vibe Crest" width="720">

</div>

<br>

## Ce que ça fait

- **Voir avant d'approuver.** Un vrai diff pour `Edit`, le contenu pour `Write`,
  le plan rendu en Markdown pour `ExitPlanMode`. Plus jamais un simple chemin de
  fichier à valider à l'aveugle.
- **Décider depuis le panneau.** Approuver, refuser, ou poser une règle qui vaut
  pour le reste de la session.
- **Répondre aux questions** de l'agent, choix multiples et réponse libre compris.
- **Suivre l'activité en direct**, chaque appel d'outil avec sa durée, sous-agents
  compris.
- **Revenir au terminal exact**, y compris le bon panneau dans VS Code grâce à
  une extension compagnon.
- **Suivre sa consommation**, calculée hors ligne depuis les transcriptions
  locales.
- **Poser le panneau où vous voulez**, sur n'importe quel bord ou en flottant,
  sur n'importe quel écran.
- **Codex CLI** est pris en charge pour ses fins de tour. Pas d'approbation ni
  de journal d'outils.

Tout reste sur la machine : un canal local entre les hooks de Claude Code et
l'application. Aucune sortie réseau, aucune télémétrie, aucun compte.

## Installation

Il faut [Node.js](https://nodejs.org) 20 ou plus.

```powershell
git clone https://github.com/xMazaki/vibecrest.git
cd vibecrest
npm install
npm start
```

L'application se lance dans la zone de notification et vous guide : installation
des hooks, réglages, et c'est parti. Ouvrez ensuite une **nouvelle** session
Claude Code, les hooks n'étant lus qu'au démarrage d'une session.

Pour construire un installeur autonome :

```powershell
npm run dist
```

## Comment ça marche

Claude Code appelle un court script à chaque événement. Ce script écrit sur un
named pipe local, l'application affiche, et pour un outil soumis à approbation
le script **reste suspendu** jusqu'à votre décision, qui repart par le même
canal.

```text
Claude Code  →  agent-hook.cjs  →  \\.\pipe\vibe-crest  →  panneau
                                                            ↓
Claude Code  ←──────── décision ────────────────────────────┘
```

Si l'application n'est pas lancée, si une erreur survient ou si le délai expire,
le script rend la main sans rien écrire et Claude Code reprend son
comportement habituel. Il ne peut pas casser une session.

## Raccourcis

| Touche | Effet |
| --- | --- |
| `Alt+G` | faire venir le panneau et lui donner le clavier |
| `A` | approuver |
| `R` | refuser |
| `T` | ne plus demander pour cet outil |
| `Tab` | demande suivante |
| `Échap` | replier |

## Développement

```powershell
npm run dev          # Vite en rechargement à chaud plus Electron
npm test             # géométrie du placement
npm run preview      # banc de rendu, écrit preview.png
npm run hero         # illustration du dépôt
```

Le banc de rendu affiche les états du panneau à partir de la feuille de style
compilée. Une capture d'écran de l'application dépend de l'état des sessions et
de la position du curseur ; le banc, lui, est déterministe.

## Limites connues

- **Codex** n'expose qu'un événement, la fin de tour. Pas d'approbation ni de
  journal d'outils.
- **Hors éditeur**, le retour au terminal active la fenêtre sans viser l'onglet.
- **Empreinte mémoire** de l'ordre de 150 à 250 Mo.

## Licence

MIT
