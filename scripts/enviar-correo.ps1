<#
  Envia un correo HTML por Gmail (smtp.gmail.com:587, STARTTLS) a nombre del dueño de esta carpeta.

  REGLA: sin -Confirmado NO envía (queda en simulación). El agente solo agrega -Confirmado
  después de mostrar la vista previa y recibir un "sí" explícito para ESE correo.

  Ejemplo:
    .\scripts\enviar-correo.ps1 -Para "a@x.com","b@x.com" -CC "c@x.com" `
      -Asunto "Informe" -CuerpoHtml ".\salida\correo.html" -Adjuntos ".\salida\informe.pdf"

  -Simular  valida todo (archivos, direcciones, credenciales) pero NO envia ni mueve nada.
  -Tarea    archivo de tareas\ que origino el correo. Al terminar se mueve a:
              tareas\completadas\    si se envio
              tareas\no-procesadas\  si fallo (con <tarea>.error.txt explicando el error)
  Todo intento real (exito o error) queda en enviados\registro.csv.
  Sin logo. Si el HTML usa cid:foto o cid:firma, se incrustan la foto y la firma de config/yo.mjs.
  -ResponderA      Message-ID del correo original para que la respuesta quede en el mismo hilo
                   (agrega In-Reply-To y References; el asunto debe ser "Re: <asunto original>").
  -ImagenesInline  imagenes que se ven DENTRO del cuerpo. Cada una se referencia en el HTML
                   como <img src="cid:NOMBRE"> donde NOMBRE es el nombre del archivo sin extension.
#>
param(
  [Parameter(Mandatory)][string[]]$Para,
  [string[]]$CC = @(),
  [string[]]$CCO = @(),
  [Parameter(Mandatory)][string]$Asunto,
  [Parameter(Mandatory)][string]$CuerpoHtml,
  [string[]]$Adjuntos = @(),
  [string[]]$ImagenesInline = @(),
  [string]$ResponderA,      # Message-ID del correo original (<...@mail.gmail.com>) para responder en el mismo hilo
  [string]$NombreRemitente,
  [string]$Tarea,
  [switch]$Simular,
  [switch]$Confirmado       # solo tras el "sí" del usuario en el chat
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$credFile = Join-Path $env:APPDATA 'AgenteCorreosPersonal\gmail-cred.xml'
. (Join-Path $PSScriptRoot '_comun.ps1')
# Nombre e imágenes salen de la configuración (config/yo.mjs); la cuenta y la clave, del .env
$datos = Leer-Perfil 'personal'
if (-not $NombreRemitente) { $NombreRemitente = $datos['NOMBRE'] }
if (-not $Confirmado -and -not $Simular) {
  Write-Host 'Sin -Confirmado: solo se valida (simulación). Muestre la vista previa y pida el "sí" antes de enviar.' -ForegroundColor Yellow
  $Simular = [switch]::new($true)
}
$registro = Join-Path $raiz 'enviados\registro.csv'
$cuenta = ''

# Registra el intento en enviados\registro.csv y mueve la tarea segun el resultado
function Cerrar-Tarea([string]$estado) {
  if ($Simular) { return }
  $exito = $estado -eq 'ENVIADO'
  $tareaFinal = ''
  if ($Tarea) {
    if (Test-Path $Tarea) {
      $dest = Join-Path $raiz ('tareas\' + $(if ($exito) { 'completadas' } else { 'no-procesadas' }))
      New-Item -ItemType Directory -Force $dest | Out-Null
      $nombre = Split-Path $Tarea -Leaf
      $destino = Join-Path $dest $nombre
      if (Test-Path $destino) {
        $destino = Join-Path $dest ('{0}_{1}{2}' -f [IO.Path]::GetFileNameWithoutExtension($nombre), (Get-Date -Format 'HHmmss'), [IO.Path]::GetExtension($nombre))
      }
      Move-Item -LiteralPath $Tarea -Destination $destino
      if (-not $exito) {
        @("Fecha:  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "Para:   $($Para -join ', ')", "Asunto: $Asunto", "Error:  $estado") |
          Set-Content ($destino + '.error.txt') -Encoding UTF8
      }
      $tareaFinal = $destino.Replace($raiz + '\', '')
    } else { $tareaFinal = "(no encontrada) $Tarea" }
  }
  [pscustomobject]@{
    Fecha    = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    De       = $cuenta
    Para     = $Para -join ';'
    CC       = $CC -join ';'
    Asunto   = $Asunto
    Adjuntos = ($Adjuntos | % { Split-Path $_ -Leaf }) -join ';'
    Estado   = $estado
    Tarea    = $tareaFinal
  } | Export-Csv $registro -Append -NoTypeInformation -Encoding UTF8
  if ($tareaFinal) { Write-Host "Tarea movida a: $tareaFinal" }
}

function Fallar($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; Cerrar-Tarea "ERROR: $msg"; exit 1 }

if ($Tarea -and -not (Test-Path $Tarea)) { Fallar "No existe la tarea: $Tarea" }

# --- Validaciones ---
$Para = @($Para | % { $_ -split '[;,]' } | % { $_.Trim() } | ? { $_ })
$CC   = @($CC   | % { $_ -split '[;,]' } | % { $_.Trim() } | ? { $_ })
$CCO  = @($CCO  | % { $_ -split '[;,]' } | % { $_.Trim() } | ? { $_ })
foreach ($d in $Para + $CC + $CCO) {
  try { [void][System.Net.Mail.MailAddress]::new($d) } catch { Fallar "Direccion invalida: $d" }
}
if (-not (Test-Path $CuerpoHtml)) { Fallar "No existe el cuerpo HTML: $CuerpoHtml" }
$total = 0
foreach ($a in $Adjuntos) {
  if (-not (Test-Path $a)) { Fallar "No existe el adjunto: $a" }
  $total += (Get-Item $a).Length
}
foreach ($img in $ImagenesInline) {
  if (-not (Test-Path $img)) { Fallar "No existe la imagen inline: $img" }
  $total += (Get-Item $img).Length
}
if ($total -gt 24MB) { Fallar ("Adjuntos suman {0:N1} MB; Gmail permite 25 MB. Usa un enlace de Drive." -f ($total/1MB)) }
# Credenciales: primero el archivo .env de la raiz (GMAIL_USER / GMAIL_APP_PASSWORD),
# si no, las guardadas con configurar-credenciales.ps1
$envFile = Join-Path $raiz '.env'
$cred = $null
if (Test-Path $envFile) {
  $vars = @{}
  Get-Content $envFile -Encoding UTF8 | % {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') {
      $vars[$Matches[1].ToUpper()] = $Matches[2].Trim('"', "'")
    }
  }
  $u = $vars['GMAIL_USER']; $p = $vars['GMAIL_APP_PASSWORD'] -replace '\s', ''
  if (-not $u -or -not $p) { Fallar ".env existe pero le falta GMAIL_USER o GMAIL_APP_PASSWORD" }
  if ($u -notmatch '^[^@\s]+@[^@\s]+\.[A-Za-z]+$') { Fallar "GMAIL_USER en .env debe ser un correo completo (ej. tu.correo@gmail.com)" }
  if ($u -eq 'tu.correo@gmail.com' -or $p -eq 'abcdefghijklmnop') { if (-not $Simular) { Fallar "El .env todavía tiene los datos de ejemplo: pon tu correo y tu contraseña de aplicación" } }
  if ($p.Length -ne 16) { Fallar "GMAIL_APP_PASSWORD debe tener 16 letras (sin espacios tiene $($p.Length))" }
  $cred = [pscredential]::new($u, (ConvertTo-SecureString $p -AsPlainText -Force))
} elseif (Test-Path $credFile) { $cred = Import-Clixml $credFile }

if ($cred) {
  $cuenta = $cred.UserName
  if ($cuenta -notmatch '@') { Fallar "La cuenta guardada '$cuenta' no es un correo completo. Usa el .env o vuelve a ejecutar configurar-credenciales.ps1" }
} elseif ($Simular) { $cuenta = '(sin credenciales configuradas)' }
else { Fallar "Faltan credenciales: crea el archivo .env (ver .env.ejemplo) o ejecuta .\scripts\configurar-credenciales.ps1" }
$html = Get-Content $CuerpoHtml -Raw -Encoding UTF8

Write-Host "De:       $NombreRemitente <$cuenta>"
Write-Host "Para:     $($Para -join ', ')"
if ($CC)  { Write-Host "CC:       $($CC -join ', ')" }
if ($CCO) { Write-Host "CCO:      $($CCO -join ', ')" }
Write-Host "Asunto:   $Asunto"
Write-Host "Adjuntos: $(if ($Adjuntos) { ($Adjuntos | % { Split-Path $_ -Leaf }) -join ', ' } else { '(ninguno)' })"
$fotoFirma = @{ foto = $datos['FOTO_RUTA']; firma = $datos['FIRMA_RUTA'] }
foreach ($k in @('foto', 'firma')) {
  if ($html -match "cid:$k") {
    if (-not $fotoFirma[$k]) { Fallar "El HTML usa cid:$k pero no existe la imagen de config/yo.mjs" }
    Write-Host "Imagen:   $k ($(Split-Path $fotoFirma[$k] -Leaf))"
  }
}
foreach ($img in $ImagenesInline) {
  $cid = [IO.Path]::GetFileNameWithoutExtension($img)
  if ($html -notmatch [regex]::Escape("cid:$cid")) { Fallar "El HTML no usa la imagen inline 'cid:$cid'" }
  Write-Host "Inline:   $(Split-Path $img -Leaf) (cid:$cid)"
}
if ($ResponderA) {
  $ResponderA = $ResponderA.Trim()
  if ($ResponderA -notmatch '^<[^<>\s]+@[^<>\s]+>$') { Fallar "Message-ID invalido: '$ResponderA' (formato: <algo@mail.gmail.com>)" }
  if ($Asunto -notmatch '^(Re|RE|re):\s') { Write-Host "AVISO: para que Gmail agrupe el hilo, el asunto debe ser 'Re: <asunto original>'" -ForegroundColor Yellow }
  Write-Host "Hilo:     responde a $ResponderA"
}

if ($Simular) { Write-Host "SIMULACION OK - no se envio nada." -ForegroundColor Yellow; exit 0 }

# --- Construir y enviar ---
$msg = $null; $smtp = $null
try {
  $msg = [System.Net.Mail.MailMessage]::new()
  $msg.From = [System.Net.Mail.MailAddress]::new($cred.UserName, $NombreRemitente)
  $Para | % { $msg.To.Add($_) }
  $CC   | % { $msg.CC.Add($_) }
  $CCO  | % { $msg.Bcc.Add($_) }
  $msg.Subject = $Asunto
  if ($ResponderA) {
    $msg.Headers.Add('In-Reply-To', $ResponderA)
    $msg.Headers.Add('References', $ResponderA)
  }
  $msg.SubjectEncoding = [Text.Encoding]::UTF8
  $msg.BodyEncoding = [Text.Encoding]::UTF8

  $vista = [System.Net.Mail.AlternateView]::CreateAlternateViewFromString($html, [Text.Encoding]::UTF8, 'text/html')
  foreach ($k in @('foto', 'firma')) {
    if ($html -match "cid:$k") {
      $tipoImg = @{ '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg' }[[IO.Path]::GetExtension($fotoFirma[$k]).ToLower()]
      $res = [System.Net.Mail.LinkedResource]::new($fotoFirma[$k], $tipoImg)
      $res.ContentId = $k
      $vista.LinkedResources.Add($res)
    }
  }
  foreach ($img in $ImagenesInline) {
    $tipo = @{ '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif' }[[IO.Path]::GetExtension($img).ToLower()]
    $ri = [System.Net.Mail.LinkedResource]::new((Resolve-Path $img).Path, $tipo)
    $ri.ContentId = [IO.Path]::GetFileNameWithoutExtension($img)
    $vista.LinkedResources.Add($ri)
  }
  $msg.AlternateViews.Add($vista)
  foreach ($a in $Adjuntos) { $msg.Attachments.Add([System.Net.Mail.Attachment]::new((Resolve-Path $a).Path)) }

  $smtp = [System.Net.Mail.SmtpClient]::new('smtp.gmail.com', 587)
  $smtp.EnableSsl = $true
  $smtp.Credentials = $cred.GetNetworkCredential()
  $smtp.Send($msg)
  $estado = 'ENVIADO'
  Write-Host "Correo enviado correctamente." -ForegroundColor Green
} catch {
  # Recorre toda la cadena de errores para guardar la respuesta real del servidor
  $partes = @(); $e = $_.Exception
  while ($e) {
    if ($e -is [System.Management.Automation.MethodInvocationException]) { $e = $e.InnerException; continue }
    $txt = $e.Message
    if ($e -is [System.Net.Mail.SmtpException]) { $txt = "[SMTP $($e.StatusCode)] $txt" }
    if ($partes -notcontains $txt) { $partes += $txt }
    $e = $e.InnerException
  }
  $estado = 'ERROR: ' + (($partes -join ' | ') -replace '\s+', ' ')
  Write-Host $estado -ForegroundColor Red
  Write-Host "Si dice 'Authentication Required' o '5.7.x': revisa la contrasena de aplicacion del .env (verificacion en 2 pasos activa)."
} finally {
  if ($msg) { $msg.Dispose() }
  if ($smtp) { $smtp.Dispose() }
}

Cerrar-Tarea $estado
if ($estado -ne 'ENVIADO') { exit 1 }
