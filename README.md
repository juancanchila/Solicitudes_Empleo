# Agente de Correos Personal

Prepara y envía tus correos escritos como tú:
- postulaciones con la hoja de vida y los soportes del perfil del cargo;
- respuestas a reclutadores;
- correos a familia y amigos.

**Nunca envía sin mostrarte la vista previa y recibir tu "sí".**

## 1. Llena tu información (formulario)
```powershell
node scripts/editor.mjs
```
Se abre en tu navegador (solo en tu equipo). Las pestañas son:
- **Contacto**
- **Foto y firma**
- **Experiencia**: los logros van por perfil.
- **Estudios**
- **Perfiles**: cada uno es una clase.
- **Soportes**: diplomas, certificados y cédula, relacionados con cada experiencia o estudio.
- **Claves y Git**: se guardan en el `.env`.

Lo marcado con ✏️ falta por llenar. Para ver todo lo que falta: `node scripts/perfil.mjs --validar`.

**Hojas de vida en vivo:** el botón **Ver hojas de vida** del formulario (o el segundo enlace que imprime la consola, `/hv?t=…`) muestra la hoja de vida de cada perfil. Se arma desde `config/yo.json` cada vez que la abres y **se recarga sola** cuando cambias un dato, la foto o la firma. Desde ahí también la descargas en PDF o la imprimes.

## 2. Estructura orientada a objetos
```
config/yo.json                 datos (los edita el formulario)
config/yo.mjs                  arma el objeto `juan` (Persona) y registra las clases de perfil
config/clases/Persona.mjs      contacto, experienciaPara(perfil), soportesPara(perfil, { tipo })
config/clases/Perfil.mjs       clase base: firma, carta, variables, adjuntosSugeridos()
config/clases/Soporte.mjs      archivo que respalda la hoja de vida
config/perfiles/PerfilProgramador.mjs             extends Perfil · "Desarrollador Backend / Frontend"
config/perfiles/PerfilSoporteInfraestructura.mjs  extends Perfil · "Soporte de Infraestructura"
config/perfiles/PerfilPersonal.mjs                extends Perfil · familia y amigos (solo nombre)
```
Para un perfil nuevo, créalo en el formulario (usa la clase genérica `Perfil`). Si necesita un comportamiento propio, crea `config/perfiles/PerfilX.mjs` que extienda `Perfil` y regístralo en `CLASES_PERFIL` de `config/yo.mjs`.

## 3. Comandos
```powershell
node scripts/perfil.mjs --lista
python -I scripts/generar_hoja_de_vida.py programador                     # hoja de vida HTML + PDF en salida/
python -I scripts/generar_hoja_de_vida.py programador --ajuste salida/x_ajuste.json --nombre acme
.\scripts\armar-correo.ps1 -Perfil programador -Destinatario "Laura" -Cuerpo .\salida\x_cuerpo.html -Salida .\salida\x_correo.html
.\scripts\enviar-correo.ps1 -Para "a@x.com" -Asunto "..." -CuerpoHtml .\salida\x_correo.html   # sin -Confirmado solo simula
.\scripts\sincronizar-git.ps1 -Simular
node --test config/clases.test.mjs
```

Detalle completo en `CLAUDE.md`.
