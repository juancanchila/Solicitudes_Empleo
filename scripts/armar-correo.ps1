<#
  Arma el HTML de un correo con la plantilla base y la firma del perfil (config/yo.mjs).
  NO envía nada: deja el HTML en salida\ para la vista previa.

  Ejemplo:
    .\scripts\armar-correo.ps1 -Perfil programador -Destinatario "Laura" `
      -Cuerpo ".\salida\2026-11-10_postulacion-acme_cuerpo.html" -Salida ".\salida\2026-11-10_postulacion-acme_correo.html"

  -Perfil        clase de perfil: programador, soporte-infraestructura, personal (node scripts/perfil.mjs --lista)
  -Destinatario  nombre para el saludo del perfil ("Buen día, Laura:" / "Hola, mamá:"). Vacío = "Buen día:".
  -Saludo / -Despedida  reemplazan los del perfil cuando la relación lo pide (contactos/RELACIONES.md).
  -Cuerpo        archivo HTML con solo el contenido (párrafos, listas).
#>
param(
  [Parameter(Mandatory)][Alias('Cargo')][string]$Perfil,
  [string]$Destinatario = '',
  [string]$Saludo = '',
  [string]$Despedida = '',
  [Parameter(Mandatory)][string]$Cuerpo,
  [Parameter(Mandatory)][string]$Salida
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_comun.ps1')

if (-not (Test-Path $Cuerpo)) { throw "No existe el cuerpo: $Cuerpo" }
$vars = Leer-Perfil $Perfil
$plantillaFirma = Join-Path $Raiz "plantillas\firma-$($vars['FIRMA_PLANTILLA']).html"

$saludoFinal = if ($Saludo) { $Saludo }
  elseif ($Destinatario) { $vars['SALUDO'].Replace('{{DESTINATARIO}}', $Destinatario) }
  else { ($vars['SALUDO'] -replace ',?\s*\{\{DESTINATARIO\}\}', '') }
$despedidaFinal = if ($Despedida) { $Despedida } else { $vars['DESPEDIDA'] }

$base = Get-Content (Join-Path $Raiz 'plantillas\correo-base.html') -Raw -Encoding UTF8
$firma = Get-Content $plantillaFirma -Raw -Encoding UTF8
$contenido = Get-Content $Cuerpo -Raw -Encoding UTF8
$html = $base.Replace('{{SALUDO}}', $saludoFinal).Replace('{{CUERPO}}', $contenido).Replace('{{DESPEDIDA}}', $despedidaFinal).Replace('{{FIRMA}}', $firma)
$html = Llenar-Datos $html $vars
$pendientes = [regex]::Matches($html, '\{\{[A-Z_]+\}\}') | % Value | Select-Object -Unique
New-Item -ItemType Directory -Force (Split-Path $Salida -Parent) | Out-Null
Set-Content -Path $Salida -Value $html -Encoding UTF8

Write-Host "Correo armado: $Salida"
Write-Host "Perfil:   $Perfil · $(if ($vars['CARGO_TITULO']) { $vars['CARGO_TITULO'] } else { 'firma personal' })"
Write-Host "Saludo:   $saludoFinal  ·  Despedida: $despedidaFinal"
if ($vars['FIRMA_PLANTILLA'] -eq 'cargo') {
  Write-Host "Foto:     $(if ($vars['FOTO_RUTA']) { 'sí' } else { 'no (falta la imagen de config/yo.mjs)' })  ·  Firma escaneada: $(if ($vars['FIRMA_RUTA']) { 'sí' } else { 'no' })"
}
foreach ($k in 'CORREO', 'CIUDAD', 'LINKEDIN', 'GITHUB') { if (-not $vars[$k]) { Write-Host "AVISO: $k vacío en config/yo.mjs (no sale en la firma)" -ForegroundColor Yellow } }
if ($pendientes) { Write-Host "AVISO: variables sin reemplazar: $($pendientes -join ', ')" -ForegroundColor Yellow }
