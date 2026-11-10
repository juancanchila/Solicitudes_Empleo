<#
  Funciones compartidas de los scripts del agente personal.
  Leer-Env      secretos del .env (cuenta de Gmail, Git). Solo para enviar-correo.ps1 y sincronizar-git.ps1.
  Leer-Perfil   variables del perfil desde la configuración orientada a objetos (config/yo.mjs).
  Llenar-Datos  reemplaza {{VARIABLE}} y quita los bloques <!--SI:X-->…<!--FIN:X--> cuya variable está vacía.
#>

$script:Raiz = Split-Path $PSScriptRoot -Parent

function Leer-Env {
  $vars = @{}
  $envFile = Join-Path $script:Raiz '.env'
  if (Test-Path $envFile) {
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
      if ($_ -notmatch '^\s*#' -and $_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*?)\s*$') {
        $vars[$Matches[1].ToUpper()] = $Matches[2].Trim('"', "'")
      }
    }
  }
  return $vars
}

# Variables del perfil (programador, soporte-infraestructura, personal…) como hashtable
function Leer-Perfil([string]$Perfil) {
  $anterior = [Console]::OutputEncoding
  [Console]::OutputEncoding = [Text.Encoding]::UTF8     # tildes y ñ intactas al leer la salida de Node
  try { $salida = & node (Join-Path $PSScriptRoot 'perfil.mjs') $Perfil --variables 2>&1 } finally { [Console]::OutputEncoding = $anterior }
  if ($LASTEXITCODE -ne 0) { throw ($salida -join ' ') }
  $texto = $salida -join "`n"
  $json = $texto | ConvertFrom-Json
  $vars = @{}
  $json.PSObject.Properties | ForEach-Object { $vars[$_.Name] = [string]$_.Value }
  return $vars
}

function Llenar-Datos([string]$texto, $vars) {
  $texto = [regex]::Replace($texto, '(?s)<!--SI:([A-Z_]+)-->(.*?)<!--FIN:\1-->', {
      param($m) if ($vars[$m.Groups[1].Value]) { $m.Groups[2].Value } else { '' } })
  foreach ($k in $vars.Keys) {
    if ($k -match 'PASSWORD|TOKEN|CLAVE') { continue }   # claves y tokens nunca entran a un documento
    $texto = $texto.Replace("{{$k}}", [string]$vars[$k])
  }
  return $texto
}
