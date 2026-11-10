# Relaciones y tono de cada correo

El agente busca al destinatario en `contactos/contactos.csv` y escribe según su **relación**.
Si no está, pregunta quién es antes de redactar, y con el "sí" del usuario lo agrega a la base.

| Relación | Ejemplos | Tono | Saludo | Despedida | Perfil de firma |
|---|---|---|---|---|---|
| `familia` | mamá, papá, hermanos, tíos | cercano, tuteo, cariñoso | "Hola, {nombre}:" | "Un abrazo," | `personal` (solo nombre) |
| `pareja` | | cercano, tuteo | "Hola, {nombre}:" | "Con cariño," | `personal` |
| `amigo` | amigos, conocidos | cercano, tuteo, informal sin groserías | "Hola, {nombre}:" | "Un abrazo," | `personal` |
| `colega` | compañeros de trabajo actuales o anteriores | cordial, tuteo si así se tratan | "Hola, {nombre}:" | "Saludos," | perfil de la columna `perfil` |
| `jefe` | jefes y líderes | formal, usted | "Buen día, {nombre}:" | "Cordialmente," | perfil de la columna `perfil` |
| `cliente` | clientes de proyectos propios | formal, usted, orientado a resultados | "Buen día, {nombre}:" | "Cordialmente," | perfil de la columna `perfil` |
| `proveedor` | proveedores de servicios o productos | formal, usted, concreto | "Buen día, {nombre}:" | "Cordialmente," | perfil de la columna `perfil` |
| `reclutador` | reclutadores, headhunters, RR. HH. | formal, usted, breve | "Buen día, {nombre}:" | "Cordialmente," | perfil de la oferta |
| `empresa` | correos de vacantes (talento@, empleo@) | formal, usted | "Buen día:" | "Cordialmente," | perfil de la oferta |
| `institucion` | universidad, bancos, entidades | formal, usted | "Buen día:" | "Atentamente," | `personal` |
| `otro` | | formal por defecto | "Buen día, {nombre}:" | "Cordialmente," | `personal` |

## Reglas
- Para la familia y los amigos no se usa la firma de cargo ni se adjunta la hoja de vida.
- A reclutadores y empresas se les manda la firma, la hoja de vida y los soportes **del perfil de la oferta** (`programador`, `soporte-infraestructura` u otro de `config/yo.json`).
- La columna `notas` del contacto manda sobre esta tabla (p. ej. "me trata de usted", "prefiere WhatsApp").
- El agente no inventa datos de un contacto: si falta el correo o la relación, pregunta.
