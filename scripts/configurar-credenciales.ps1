# Guarda la cuenta de Gmail cifrada para ESTE usuario de Windows en ESTE equipo.
# Usuario: tu correo completo (ej. tu.correo@gmail.com)
# Clave:   una "contrasena de aplicacion" de Google (16 letras), NO tu contrasena normal.
#          Se crea en https://myaccount.google.com/apppasswords (requiere verificacion en 2 pasos).

$dir = Join-Path $env:APPDATA 'AgenteCorreosPersonal'
New-Item -ItemType Directory -Force $dir | Out-Null
$archivo = Join-Path $dir 'gmail-cred.xml'

$cred = Get-Credential -Message 'Tu correo personal y contrasena de aplicacion de Google'
if (-not $cred) { Write-Host 'Cancelado.'; exit 1 }

$cred | Export-Clixml -Path $archivo
Write-Host "Credenciales guardadas (cifradas) en $archivo" -ForegroundColor Green
