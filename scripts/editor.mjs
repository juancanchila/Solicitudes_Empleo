// Formulario para editar la configuración del agente (config/yo.json), las imágenes, los soportes y las claves del .env.
//
//   node scripts/editor.mjs            abre http://127.0.0.1:4777/?t=<token>
//   Hojas de vida en vivo:             http://127.0.0.1:4777/hv?t=<token>  (una por perfil; se recargan solas al cambiar los datos)
//
// Seguridad:
//  - Solo escucha en 127.0.0.1 (tu equipo). Cada arranque genera un token: sin él la API no responde.
//  - Antes de guardar yo.json se valida construyendo las clases, y se respalda la versión anterior en config/respaldos/.
//  - Las claves del .env (contraseña de Gmail, token de GitHub) se pueden escribir pero NUNCA se devuelven al navegador.
//  - Un soporte borrado no se elimina: pasa a soportes/_papelera/.

import { randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { exec, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CLASES_PERFIL, RUTA_CONFIG, construirPersona } from '../config/yo.mjs';
import { TIPOS_SOPORTE } from '../config/clases/Soporte.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.EDITOR_PUERTO) || 4777;
const TOKEN = randomBytes(18).toString('hex');
const ENV = join(RAIZ, '.env');
const SOPORTES = join(RAIZ, 'soportes');
const RESPALDOS = join(RAIZ, 'config', 'respaldos');
const MAX_ARCHIVO = 20 * 1024 * 1024;
const EXT_SOPORTE = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.doc', '.xlsx', '.zip']);
const EXT_IMAGEN = new Set(['.png', '.jpg', '.jpeg']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.zip': 'application/zip', '.doc': 'application/msword' };

// Claves del .env que se editan aquí. Las "secretas" nunca se devuelven.
const CAMPOS_ENV = [
    { clave: 'GMAIL_USER', etiqueta: 'Correo de envío (Gmail)', secreta: false },
    { clave: 'GMAIL_APP_PASSWORD', etiqueta: 'Contraseña de aplicación de Google (16 letras)', secreta: true },
    { clave: 'GIT_USUARIO', etiqueta: 'Usuario de GitHub', secreta: false },
    { clave: 'GIT_CORREO', etiqueta: 'Correo de los commits', secreta: false },
    { clave: 'GIT_REPO_URL', etiqueta: 'URL del repositorio', secreta: false },
    { clave: 'GIT_RAMA', etiqueta: 'Rama', secreta: false },
    { clave: 'GITHUB_TOKEN', etiqueta: 'Token personal de GitHub', secreta: true }
];
const EJEMPLOS = /tu\.correo|tu-usuario|abcd efgh|x{10}/;

// ---------------------------------------------------------------- datos

const leerDatos = () => JSON.parse(readFileSync(RUTA_CONFIG, 'utf8'));

const guardarDatos = (datos) => {
    construirPersona(datos); // valida: lanza si un perfil o un soporte está mal formado
    mkdirSync(RESPALDOS, { recursive: true });
    if (existsSync(RUTA_CONFIG)) copyFileSync(RUTA_CONFIG, join(RESPALDOS, `yo_${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
    const respaldos = readdirSync(RESPALDOS).filter((f) => f.startsWith('yo_')).sort();
    respaldos.slice(0, Math.max(0, respaldos.length - 30)).forEach((f) => rmSync(join(RESPALDOS, f))); // deja los 30 últimos
    writeFileSync(RUTA_CONFIG, `${JSON.stringify(datos, null, 2)}\n`, 'utf8');
};

const leerEnv = () => {
    const vars = {};
    if (!existsSync(ENV)) return vars;
    for (const linea of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
        const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*?)\s*$/);
        if (m && !linea.trim().startsWith('#')) vars[m[1].toUpperCase()] = m[2].replace(/^["']|["']$/g, '');
    }
    return vars;
};

/** Estado de las claves para el formulario: valor de las no secretas; de las secretas solo si están configuradas. */
const estadoEnv = () => {
    const v = leerEnv();
    return CAMPOS_ENV.map(({ clave, etiqueta, secreta }) => {
        const actual = v[clave] ?? '';
        const configurada = Boolean(actual) && !EJEMPLOS.test(actual);
        return { clave, etiqueta, secreta, configurada, valor: secreta ? '' : configurada ? actual : '' };
    });
};

/** Actualiza el .env conservando comentarios y demás líneas. Un campo secreto vacío = no se toca. */
const guardarEnv = (cambios) => {
    const permitidas = new Map(CAMPOS_ENV.map((c) => [c.clave, c]));
    const limpios = {};
    for (const [k, valor] of Object.entries(cambios ?? {})) {
        const campo = permitidas.get(k);
        if (!campo) continue;
        const v = String(valor ?? '').replace(/[\r\n]/g, '').trim();
        if (campo.secreta && !v) continue;
        if (k === 'GMAIL_APP_PASSWORD' && v.replace(/\s/g, '').length !== 16) throw new Error('La contraseña de aplicación de Google tiene 16 letras.');
        if (k === 'GMAIL_USER' && v && !/^[^@\s]+@[^@\s]+\.[A-Za-z]+$/.test(v)) throw new Error('El correo de envío no es válido.');
        limpios[k] = v;
    }
    const lineas = existsSync(ENV) ? readFileSync(ENV, 'utf8').split(/\r?\n/) : [];
    const hechos = new Set();
    const nuevas = lineas.map((l) => {
        const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (m && m[1] in limpios) { hechos.add(m[1]); return `${m[1]}=${limpios[m[1]]}`; }
        return l;
    });
    for (const [k, v] of Object.entries(limpios)) if (!hechos.has(k)) nuevas.push(`${k}=${v}`);
    writeFileSync(ENV, nuevas.join('\n').replace(/\n*$/, '\n'), 'utf8');
    return Object.keys(limpios);
};

// ---------------------------------------------------------------- archivos

const slug = (t) => String(t || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'archivo';

const decodificar = (base64) => {
    const b = Buffer.from(String(base64 ?? '').replace(/^data:[^,]+,/, ''), 'base64');
    if (!b.length) throw new Error('El archivo llegó vacío.');
    if (b.length > MAX_ARCHIVO) throw new Error('El archivo pasa de 20 MB.');
    return b;
};

/** Ruta dentro de una carpeta, sin escaparse de ella. */
const dentroDe = (carpeta, relativa) => {
    const ruta = resolve(carpeta, relativa);
    if (!ruta.startsWith(resolve(carpeta) + sep)) throw new Error('Ruta inválida.');
    return ruta;
};

const subirImagen = (tipo, { nombreArchivo, base64 }) => {
    if (!['foto', 'firma'].includes(tipo)) throw new Error('Imagen desconocida.');
    const ext = extname(nombreArchivo || '').toLowerCase();
    if (!EXT_IMAGEN.has(ext)) throw new Error('Use una imagen PNG o JPG.');
    const datos = leerDatos();
    const destino = `perfil/${tipo}${ext === '.jpeg' ? '.jpg' : ext}`;
    const anterior = datos.persona.imagenes?.[tipo];
    if (anterior && existsSync(join(RAIZ, anterior))) {
        mkdirSync(join(RAIZ, 'perfil', 'anteriores'), { recursive: true });
        renameSync(join(RAIZ, anterior), join(RAIZ, 'perfil', 'anteriores', `${Date.now()}_${basename(anterior)}`));
    }
    writeFileSync(join(RAIZ, destino), decodificar(base64));
    datos.persona.imagenes = { ...datos.persona.imagenes, [tipo]: destino };
    guardarDatos(datos);
    return destino;
};

const subirSoporte = ({ nombreArchivo, base64, nombre, tipo = 'otro', relacion, perfiles = [], fecha, notas = '' }) => {
    const ext = extname(nombreArchivo || '').toLowerCase();
    if (!EXT_SOPORTE.has(ext)) throw new Error(`Tipo de archivo no permitido (${ext || 'sin extensión'}). Use PDF, imagen, Word, Excel o ZIP.`);
    if (!TIPOS_SOPORTE[tipo]) throw new Error('Tipo de soporte desconocido.');
    const datos = leerDatos();
    const id = randomUUID().slice(0, 8);
    const archivo = `${tipo}/${slug(nombre || basename(nombreArchivo, ext))}_${id}${ext}`;
    mkdirSync(join(SOPORTES, tipo), { recursive: true });
    writeFileSync(dentroDe(SOPORTES, archivo), decodificar(base64));
    const soporte = { id, nombre: nombre || basename(nombreArchivo, ext), tipo, archivo, relacion: relacion?.tipo ? relacion : { tipo: 'general' }, perfiles, fecha: fecha || new Date().toISOString().slice(0, 10), notas };
    datos.soportes = [...(datos.soportes ?? []), soporte];
    guardarDatos(datos);
    return soporte;
};

const quitarSoporte = (id) => {
    const datos = leerDatos();
    const s = (datos.soportes ?? []).find((x) => x.id === id);
    if (!s) throw new Error('No existe ese soporte.');
    const origen = dentroDe(SOPORTES, s.archivo);
    if (existsSync(origen)) {
        mkdirSync(join(SOPORTES, '_papelera'), { recursive: true });
        renameSync(origen, join(SOPORTES, '_papelera', `${Date.now()}_${basename(s.archivo)}`));
    }
    datos.soportes = datos.soportes.filter((x) => x.id !== id);
    guardarDatos(datos);
};

// ---------------------------------------------------------------- hojas de vida en vivo

const GENERADOR = join(RAIZ, 'scripts', 'generar_hoja_de_vida.py');
const texto = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Corre el generador de Python (el mismo de los PDF) y devuelve el HTML del perfil. */
const generarHv = (perfil, extra = []) => new Promise((ok, mal) => {
    execFile('python', ['-I', GENERADOR, perfil, ...extra], { encoding: 'buffer', maxBuffer: 40 * 1024 * 1024, timeout: 120000, cwd: RAIZ }, (error, stdout, stderr) => {
        const lineas = stderr.toString('utf8').split(/\r?\n/);
        const avisos = lineas.filter((l) => l.startsWith('PENDIENTE:')).map((l) => l.slice(11));
        if (error) return mal(new Error(lineas.filter(Boolean).pop() || 'No se pudo generar la hoja de vida.'));
        ok({ html: stdout.toString('utf8'), avisos });
    });
});

/** Cambia cada vez que cambian los datos, las imágenes o el diseño: la página en vivo lo consulta para recargarse. */
const versionDatos = () => {
    const datos = existsSync(RUTA_CONFIG) ? leerDatos() : { persona: {} };
    const archivos = [RUTA_CONFIG, GENERADOR, ...Object.values(datos.persona?.imagenes ?? {}).map((x) => join(RAIZ, x))];
    return archivos.filter((a) => existsSync(a)).map((a) => Math.round(statSync(a).mtimeMs)).join('-');
};

const perfilesConHv = () => Object.entries(leerDatos().perfiles ?? {}).filter(([, p]) => p.adjuntaHojaDeVida !== false && p.firma !== 'personal');

/** Barra de herramientas (no se imprime) y recarga automática que se inyectan en la hoja de vida. */
const barraHv = (perfil, avisos) => {
    const opciones = perfilesConHv().map(([k, p]) => `<option value="${k}" ${k === perfil ? 'selected' : ''}>${texto(p.titulo || k)}</option>`).join('');
    const lista = avisos.map((a) => `<li>${texto(a)}</li>`).join('');
    return `
<style>
  .hv-barra { position: fixed; top: 10px; right: 10px; z-index: 9; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; max-width: 92vw;
    background: rgba(17,24,39,.92); color: #fff; padding: 8px 10px; border-radius: 10px; font: 13px 'Segoe UI', sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
  .hv-barra select, .hv-barra a, .hv-barra button { font: inherit; border-radius: 6px; border: 1px solid #374151; background: #1f2937; color: #fff; padding: 4px 8px; text-decoration: none; cursor: pointer; }
  .hv-barra a.pdf { background: #2563eb; border-color: #2563eb; }
  .hv-barra small { color: #9ca3af; }
  .hv-barra details { width: 100%; color: #fcd34d; } .hv-barra details ul { margin: 4px 0 0; padding-left: 18px; color: #e5e7eb; }
  @media screen { html { background: #d1d5db; } .hoja { box-shadow: 0 6px 30px rgba(0,0,0,.18); margin: 16px auto; background: linear-gradient(to right, #111827 66mm, #ffffff 66mm); } }
  @media print { .hv-barra { display: none !important; } }
</style>
<div class="hv-barra">
  <select onchange="location.href='/hv/'+this.value+'?t=${TOKEN}'">${opciones}</select>
  <a class="pdf" href="/hv/${perfil}.pdf?t=${TOKEN}">Descargar PDF</a>
  <button onclick="print()">Imprimir</button>
  <a href="/?t=${TOKEN}" target="formulario">Editar datos</a>
  <a href="/hv?t=${TOKEN}">Todas</a>
  <small id="hv-estado">En vivo · ${new Date().toLocaleTimeString('es-CO')}</small>
  ${avisos.length ? `<details><summary>${avisos.length} dato(s) por completar</summary><ul>${lista}</ul></details>` : ''}
</div>
<script>
  (() => {
    const version = ${JSON.stringify(versionDatos())};
    setInterval(async () => {
      try {
        const r = await fetch('/api/version', { headers: { 'x-token': '${TOKEN}' } });
        const j = await r.json();
        if (j.version !== version) location.reload();
      } catch { document.getElementById('hv-estado').textContent = 'Sin conexión con el formulario'; }
    }, 2500);
  })();
</script>`;
};

const paginaIndiceHv = () => {
    const tarjetas = perfilesConHv().map(([k, p]) => `<a class="t" href="/hv/${k}?t=${TOKEN}" style="--c:${texto(p.color || '#2563eb')}"><strong>${texto(p.titulo || k)}</strong><small>${k}</small><span>Ver hoja de vida →</span></a>`).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hojas de vida</title>
<style>body{margin:0;font:15px 'Segoe UI',sans-serif;background:#f5f6f8;color:#1f2937}main{max-width:900px;margin:0 auto;padding:32px 16px}
h1{margin:0 0 6px}p{color:#6b7280;margin:0 0 24px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.t{display:flex;flex-direction:column;gap:4px;padding:18px;border-radius:14px;background:#fff;border:1px solid #e5e7eb;border-top:5px solid var(--c);text-decoration:none;color:inherit;transition:transform .2s,box-shadow .2s}
.t:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(0,0,0,.08)}.t small{color:#6b7280}.t span{color:var(--c);font-weight:600;margin-top:8px}a.e{color:#2563eb}</style></head>
<body><main><h1>Hojas de vida</h1><p>Una por perfil, armada en vivo desde config/yo.json. Si cambias algo en el <a class="e" href="/?t=${TOKEN}">formulario</a>, se actualiza sola.</p><div class="g">${tarjetas}</div></main></body></html>`;
};

// ---------------------------------------------------------------- HTTP

const leerCuerpo = (req) => new Promise((ok, mal) => {
    const partes = [];
    let total = 0;
    req.on('data', (c) => {
        total += c.length;
        if (total > MAX_ARCHIVO * 1.4) { mal(new Error('Envío demasiado grande.')); req.destroy(); } else partes.push(c);
    });
    req.on('end', () => {
        try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { mal(new Error('JSON inválido.')); }
    });
    req.on('error', mal);
});

const json = (res, estado, cuerpo) => {
    res.writeHead(estado, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(cuerpo));
};

const archivo = (res, ruta) => {
    if (!existsSync(ruta)) return json(res, 404, { error: 'No existe el archivo.' });
    res.writeHead(200, { 'content-type': MIME[extname(ruta).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(ruta));
};

const estado = () => {
    const datos = leerDatos();
    const yo = construirPersona(datos);
    return {
        datos,
        clases: Object.keys(CLASES_PERFIL),
        tiposSoporte: TIPOS_SOPORTE,
        imagenes: Object.fromEntries(['foto', 'firma'].map((k) => [k, Boolean(datos.persona.imagenes?.[k] && existsSync(join(RAIZ, datos.persona.imagenes[k])))])),
        archivosSoporte: Object.fromEntries((datos.soportes ?? []).map((s) => [s.id, existsSync(join(SOPORTES, s.archivo))])),
        pendientes: [...yo.pendientes(), ...yo.perfiles.flatMap((p) => p.pendientes())],
        env: estadoEnv()
    };
};

const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
    const ruta = url.pathname;
    try {
        // Página del formulario (estática)
        if (req.method === 'GET' && (ruta === '/' || ruta === '/editor.js' || ruta === '/editor.css')) {
            return archivo(res, join(RAIZ, 'editor', ruta === '/' ? 'editor.html' : ruta.slice(1)));
        }
        if (!ruta.startsWith('/api/') && !ruta.startsWith('/hv')) return json(res, 404, { error: 'No existe.' });
        // Toda la API y las hojas de vida exigen el token del arranque (en encabezado o en ?t=)
        if ((req.headers['x-token'] ?? url.searchParams.get('t')) !== TOKEN) return json(res, 401, { error: 'Token inválido: abra el enlace que imprimió la consola.' });

        // Hojas de vida en vivo
        if (req.method === 'GET' && ruta === '/hv') {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            return res.end(paginaIndiceHv());
        }
        const hv = ruta.match(/^\/hv\/([a-z0-9-]+)(\.pdf)?$/);
        if (req.method === 'GET' && hv) {
            const [, perfil, pdf] = hv;
            if (!perfilesConHv().some(([k]) => k === perfil)) return json(res, 404, { error: 'Ese perfil no tiene hoja de vida.' });
            if (pdf) {
                await generarHv(perfil);   // escribe salida/hoja-de-vida_<perfil>.pdf con los datos de este momento
                const d = leerDatos();
                const nombre = `Hoja de vida - ${d.persona.nombre} - ${d.perfiles[perfil].titulo || perfil}.pdf`;
                res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${slug(nombre)}.pdf"; filename*=UTF-8''${encodeURIComponent(nombre)}`, 'cache-control': 'no-store' });
                return res.end(readFileSync(join(RAIZ, 'salida', `hoja-de-vida_${perfil}.pdf`)));
            }
            const { html, avisos } = await generarHv(perfil, ['--stdout']);
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            return res.end(html.replace('</body>', `${barraHv(perfil, avisos)}</body>`));
        }
        if (req.method === 'GET' && ruta === '/api/version') return json(res, 200, { version: versionDatos() });

        if (req.method === 'GET' && ruta === '/api/estado') return json(res, 200, estado());
        if (req.method === 'PUT' && ruta === '/api/datos') {
            const { datos } = await leerCuerpo(req);
            guardarDatos({ ...datos, soportes: leerDatos().soportes ?? [] }); // los soportes solo cambian por su API
            return json(res, 200, estado());
        }
        const img = ruta.match(/^\/api\/imagen\/(foto|firma)$/);
        if (img && req.method === 'GET') {
            const r = leerDatos().persona.imagenes?.[img[1]];
            return r ? archivo(res, join(RAIZ, r)) : json(res, 404, { error: 'Sin imagen.' });
        }
        if (img && req.method === 'POST') { subirImagen(img[1], await leerCuerpo(req)); return json(res, 200, estado()); }

        if (req.method === 'POST' && ruta === '/api/soportes') { subirSoporte(await leerCuerpo(req)); return json(res, 201, estado()); }
        const sop = ruta.match(/^\/api\/soportes\/([\w-]+)(\/archivo)?$/);
        if (sop) {
            const datos = leerDatos();
            const s = (datos.soportes ?? []).find((x) => x.id === sop[1]);
            if (!s) return json(res, 404, { error: 'No existe ese soporte.' });
            if (sop[2] && req.method === 'GET') return archivo(res, dentroDe(SOPORTES, s.archivo));
            if (req.method === 'PUT') {
                const { nombre, tipo, relacion, perfiles, fecha, notas } = await leerCuerpo(req);
                Object.assign(s, { nombre: nombre ?? s.nombre, tipo: tipo ?? s.tipo, relacion: relacion ?? s.relacion, perfiles: perfiles ?? s.perfiles, fecha: fecha ?? s.fecha, notas: notas ?? s.notas });
                guardarDatos(datos);
                return json(res, 200, estado());
            }
            if (req.method === 'DELETE') { quitarSoporte(s.id); return json(res, 200, estado()); }
        }
        if (req.method === 'PUT' && ruta === '/api/env') {
            const cambiadas = guardarEnv((await leerCuerpo(req)).valores);
            return json(res, 200, { ...estado(), cambiadas });
        }
        return json(res, 404, { error: 'No existe.' });
    } catch (error) {
        return json(res, 400, { error: error.message });
    }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
    const enlace = `http://127.0.0.1:${PUERTO}/?t=${TOKEN}`;
    console.log(`Formulario del agente: ${enlace}`);
    console.log(`Hojas de vida en vivo: http://127.0.0.1:${PUERTO}/hv?t=${TOKEN}`);
    console.log('Ctrl + C para cerrarlo.');
    if (!process.argv.includes('--sin-abrir') && process.platform === 'win32') exec(`start "" "${enlace}"`);
});
