# Capture une bande horizontale en haut de l'écran, pour vérifier visuellement
# le rendu du pill pendant le développement.
#
# Par défaut la capture couvre l'ensemble du bureau virtuel, car le pill suit
# le curseur et peut donc vivre sur un écran secondaire.

param(
  [string]$Out = "shot.png",
  [int]$Height = 320,
  [switch]$PrimaryOnly
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if ($PrimaryOnly) {
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
} else {
  $area = [System.Windows.Forms.SystemInformation]::VirtualScreen
}

$height = [Math]::Min($Height, $area.Height)
$bitmap = New-Object System.Drawing.Bitmap($area.Width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($area.X, $area.Y, 0, 0, (New-Object System.Drawing.Size($area.Width, $height)))
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "$Out ($($area.Width) x $height) origine ($($area.X),$($area.Y))"
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  Write-Output ("  ecran {0} {1}x{2} @ ({3},{4}){5}" -f $s.DeviceName, $s.Bounds.Width, $s.Bounds.Height, $s.Bounds.X, $s.Bounds.Y, $(if ($s.Primary) { " principal" } else { "" }))
}
