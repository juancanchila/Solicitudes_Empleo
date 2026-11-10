<#
  Sube este agente a tu repositorio personal de Git (GitHub) con los datos del .env:
  GIT_USUARIO, GIT_CORREO, GIT_REPO_URL, GIT_RAMA, GITHUB_TOKEN.

  Ejemplo:
    .\scripts\sincronizar-git.ps1 -Mensaje "Agrego firma de soporte de infraestructura"
    .\scripts\sincronizar-git.ps1 -Simular      # muestra qué se subiría, sin commit ni push

  Seguridad:
  - El .gitignore deja FUERA: .env, soportes\ (diplomas, cédula…), respaldos, contactos.csv, postulaciones.csv, salida\ y enviados\.
    La foto y la firma SÍ se suben (las usa el agente en cualquier equipo); config/yo.json también (no tiene claves).
    Antes de subir, el script verifica que ninguno de esos quedó preparado para el commit.
  - El token NO se escribe en .git/config ni en la URL del remoto: se pasa solo durante el push
    como encabezado HTTP de esa orden.
  - El agente solo lo corre cuando el usuario lo pide en el chat.
#>
param(
  [string]$Mensaje = "Actualización del agente $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
  [switch]$Simular
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_comun.ps1')
Set-Location $Raiz
$v = Leer-Env

foreach ($k in 'GIT_USUARIO', 'GIT_CORREO', 'GIT_REPO_URL', 'GITHUB_TOKEN') {
  if (-not $v[$k] -or $v[$k] -match 'tu-usuario|tu\.correo|x{10}') { throw "Falta $k en el .env (todavía tiene el valor de ejemplo)." }
}
$rama = if ($v['GIT_RAMA']) { $v['GIT_RAMA'] } else { 'main' }

if (-not (Test-Path (Join-Path $Raiz '.git'))) {
  git init -b $rama | Out-Null
  Write-Host "Repositorio creado en $Raiz"
}
git config user.name $v['GIT_USUARIO']
git config user.email $v['GIT_CORREO']
$remoto = git remote 2>$null
if ($remoto -notcontains 'origin') { git remote add origin $v['GIT_REPO_URL'] } else { git remote set-url origin $v['GIT_REPO_URL'] }

git add -A
# Nunca suben datos personales ni claves, aunque alguien cambie el .gitignore
$prohibidos = git diff --cached --name-only | Where-Object { $_ -match '(^|/)\.env$|^soportes/|^config/respaldos/|perfil/anteriores/|contactos\.csv$|postulaciones\.csv$|^salida/|^enviados/' }
if ($prohibidos) { git reset -q; throw "Se iban a subir archivos privados: $($prohibidos -join ', '). Revise el .gitignore." }

$cambios = git diff --cached --name-status
if (-not $cambios) { Write-Host 'No hay cambios para subir.'; exit 0 }
Write-Host "Cambios a subir:`n$($cambios -join "`n")"
if ($Simular) { git reset -q; Write-Host 'SIMULACIÓN: no se hizo commit ni push.' -ForegroundColor Yellow; exit 0 }

git commit -q -m $Mensaje
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($v['GIT_USUARIO']):$($v['GITHUB_TOKEN'])"))
git -c "http.extraHeader=Authorization: Basic $basic" push -u origin $rama
if ($LASTEXITCODE -ne 0) { throw 'El push falló: revise que el token tenga permiso de escritura sobre ese repositorio y que el repositorio exista.' }
Write-Host "Subido a $($v['GIT_REPO_URL']) ($rama)." -ForegroundColor Green
