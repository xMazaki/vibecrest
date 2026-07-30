# Remonte la chaîne des processus parents depuis un PID, choisit la fenêtre à
# activer, puis la met au premier plan.
#
# Sûreté : StartPid est typé [int] et PreferProcess est validé côté appelant
# contre une liste fermée de noms d'exécutables. Les identifiants réinjectés
# dans les filtres CIM proviennent de ParentProcessId, donc d'entiers. Aucune
# chaîne extérieure n'est interpolée dans du code.
#
# Choix de la fenêtre : la première fenêtre rencontrée en remontant n'est pas
# toujours la bonne. Dans un terminal intégré à VS Code, la chaîne traverse
# l'hôte de pseudo-terminal avant d'atteindre la fenêtre de l'éditeur. Quand
# l'appelant sait quel hôte il vise, il le passe en préférence.
#
# Premier plan : Windows refuse SetForegroundWindow à un processus qui n'est
# pas déjà au premier plan, et PowerShell est ici un fils sans fenêtre. Sans la
# parade AttachThreadInput, l'appel se contente de faire clignoter la barre des
# tâches. C'est la cause classique du bouton qui semble ne rien faire.
#
# Sortie : une ligne unique "STATUT|fenetre|chaine", et un code de retour.

param(
  [int]$StartPid,
  [string]$PreferProcess = ""
)

$signature = @'
using System;
using System.Runtime.InteropServices;
public static class VibeCrestWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool state);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

  public static bool Focus(IntPtr target) {
    if (IsIconic(target)) ShowWindow(target, 9);

    IntPtr foreground = GetForegroundWindow();
    uint targetThread = GetWindowThreadProcessId(target, IntPtr.Zero);
    uint foregroundThread = GetWindowThreadProcessId(foreground, IntPtr.Zero);
    uint self = GetCurrentThreadId();

    if (foregroundThread != self) AttachThreadInput(self, foregroundThread, true);
    if (targetThread != self && targetThread != foregroundThread) AttachThreadInput(self, targetThread, true);

    BringWindowToTop(target);
    bool ok = SetForegroundWindow(target);

    if (!ok) {
      // Dernier recours : forcer le z-order sans activer, puis réessayer.
      SetWindowPos(target, new IntPtr(-1), 0, 0, 0, 0, 0x0003);
      SetWindowPos(target, new IntPtr(-2), 0, 0, 0, 0, 0x0003);
      ok = SetForegroundWindow(target);
    }

    if (targetThread != self && targetThread != foregroundThread) AttachThreadInput(self, targetThread, false);
    if (foregroundThread != self) AttachThreadInput(self, foregroundThread, false);
    return ok;
  }
}
'@

try { Add-Type -TypeDefinition $signature -ErrorAction Stop } catch { }

# 1. Collecte de la chaîne des ancêtres.
$chain = New-Object System.Collections.ArrayList
$current = $StartPid

for ($depth = 0; $depth -lt 16; $depth++) {
  if ($current -le 4) { break }
  $proc = Get-Process -Id $current -ErrorAction SilentlyContinue
  if ($null -eq $proc) { break }

  [void]$chain.Add([pscustomobject]@{
    Name   = $proc.ProcessName
    Id     = $proc.Id
    Handle = $proc.MainWindowHandle
  })

  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $current" -ErrorAction SilentlyContinue
  if ($null -eq $info) { break }
  $current = [int]$info.ParentProcessId
}

$trace = ($chain | ForEach-Object { $_.Name }) -join ">"
# Les identifiants servent à l'extension VS Code : le shell d'un terminal
# intégré fait partie de cette chaîne, et c'est lui que l'API des terminaux
# expose. Il suffit donc de les transmettre tous et de laisser l'extension
# chercher la correspondance.
$ids = ($chain | ForEach-Object { $_.Id }) -join ","

# 2. Choix de la cible : l'hôte attendu s'il est présent, sinon la première
#    fenêtre rencontrée.
$withWindow = $chain | Where-Object { $_.Handle -ne [IntPtr]::Zero }
$target = $null

if ($PreferProcess -ne "") {
  $target = $withWindow | Where-Object { $_.Name -ieq $PreferProcess } | Select-Object -First 1
  if ($null -eq $target) {
    $target = $withWindow | Where-Object { $_.Name -ilike "*$PreferProcess*" } | Select-Object -First 1
  }
}
if ($null -eq $target) { $target = $withWindow | Select-Object -First 1 }

if ($null -eq $target) {
  Write-Output ("NOWINDOW||" + $trace + "|" + $ids)
  exit 1
}

# 3. Activation.
$ok = $false
try { $ok = [VibeCrestWin]::Focus($target.Handle) } catch { $ok = $false }

if (-not $ok) {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $ok = [bool]$shell.AppActivate($target.Id)
  } catch { }
}

if ($ok) {
  Write-Output ("OK|" + $target.Name + "|" + $trace + "|" + $ids)
  exit 0
}

Write-Output ("REFUSED|" + $target.Name + "|" + $trace + "|" + $ids)
exit 2
