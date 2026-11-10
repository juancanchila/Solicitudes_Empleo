// Formulario del agente de correos personal. Habla solo con scripts/editor.mjs (127.0.0.1) usando el token del enlace.
(() => {
  const TOKEN = new URLSearchParams(location.search).get('t') ?? '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PEND = '✏️';

  let estado = null;      // respuesta de /api/estado
  let datos = null;       // copia editable de yo.json
  let sucio = false;

  // ------------------------------------------------------------ API
  const api = async (metodo, ruta, cuerpo) => {
    const r = await fetch(ruta, { method: metodo, headers: { 'content-type': 'application/json', 'x-token': TOKEN }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
    return j;
  };
  const aviso = (texto, error = false) => {
    const t = $('#aviso');
    t.textContent = texto;
    t.className = `toast${error ? ' error' : ''}`;
    t.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => (t.hidden = true), error ? 7000 : 3500);
  };
  const leerArchivo = (f) => new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result);
    lector.onerror = () => mal(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(f);
  });

  // ------------------------------------------------------------ rutas dentro de datos ("persona.redes.github")
  const obtener = (ruta) => ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), datos);
  const fijar = (ruta, valor) => {
    const partes = ruta.split('.');
    const ultimo = partes.pop();
    const destino = partes.reduce((o, k) => (o[k] ??= /^\d+$/.test(k) ? [] : {}), datos);
    destino[ultimo] = valor;
  };
  const marcarSucio = () => { sucio = true; $('#cambios').hidden = false; contarPendientes(); };

  const campo = (ruta, etiqueta, { tipo = 'text', ancho = false, area = false, placeholder = '', lista = null } = {}) => {
    const v = obtener(ruta) ?? '';
    const valor = lista ? (Array.isArray(v) ? v.join(lista) : v) : v;
    const clase = String(valor).includes(PEND) ? 'pendiente' : '';
    const control = area
      ? `<textarea data-ruta="${ruta}" ${lista ? `data-lista="${esc(lista)}"` : ''} class="${clase}" placeholder="${esc(placeholder)}">${esc(valor)}</textarea>`
      : `<input type="${tipo}" data-ruta="${ruta}" ${lista ? `data-lista="${esc(lista)}"` : ''} class="${clase}" value="${esc(valor)}" placeholder="${esc(placeholder)}">`;
    return `<label class="${ancho ? 'ancho' : ''}">${esc(etiqueta)}${control}</label>`;
  };

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset?.ruta) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.lista) v = String(v).split(el.dataset.lista === '\n' ? /\n/ : /,/).map((x) => x.trim()).filter(Boolean);
    fijar(el.dataset.ruta, v);
    el.classList.toggle('pendiente', String(el.value).includes(PEND));
    if (el.dataset.ruta === 'persona.nombre') $('#titulo-nombre').textContent = el.value || 'Mi perfil';
    marcarSucio();
  });

  // ------------------------------------------------------------ secciones
  const pintarContacto = () => {
    $('#form-contacto').innerHTML = [
      campo('persona.nombre', 'Nombre completo'),
      campo('persona.nombreCorto', 'Nombre corto (familia y amigos)'),
      campo('persona.correo', 'Correo que se muestra', { tipo: 'email' }),
      campo('persona.telefono', 'Teléfono (como se lee)', { placeholder: '301 388 1688' }),
      campo('persona.whatsapp', 'WhatsApp con indicativo', { placeholder: '573013881688' }),
      campo('persona.ciudad', 'Ciudad'),
      campo('persona.documento', 'Documento (vacío = no se muestra)'),
      campo('persona.redes.linkedin', 'LinkedIn (URL)'),
      campo('persona.redes.github', 'GitHub (URL)'),
      campo('persona.redes.portafolio', 'Portafolio (URL)')
    ].join('');
  };

  const pintarImagenes = () => {
    for (const k of ['foto', 'firma']) {
      const img = $(`#img-${k}`);
      const hay = estado.imagenes[k];
      img.hidden = !hay;
      $(`#sin-${k}`).hidden = hay;
      if (hay) img.src = `/api/imagen/${k}?t=${TOKEN}&v=${Date.now()}`;
    }
    const mini = $('#mini-foto');
    mini.hidden = !estado.imagenes.foto;
    if (estado.imagenes.foto) mini.src = `/api/imagen/foto?t=${TOKEN}&v=${Date.now()}`;
  };

  const clavesPerfiles = () => Object.keys(datos.perfiles ?? {});

  const pintarExperiencia = () => {
    $('#lista-exp').innerHTML = (datos.experiencia ?? []).map((x, i) => {
      const r = `experiencia.${i}`;
      const logros = ['general', ...clavesPerfiles().filter((k) => datos.perfiles[k].firma !== 'personal')]
        .map((k) => campo(`${r}.logros.${k}`, `Logros · ${k === 'general' ? 'general (cualquier perfil)' : datos.perfiles[k].titulo || k}`, { area: true, lista: '\n', placeholder: 'Uno por línea: qué hice, con qué y qué resultado' }))
        .join('');
      return `<div class="tarjeta">
        <div class="rejilla">${campo(`${r}.empresa`, 'Empresa')}${campo(`${r}.cargo`, 'Cargo')}${campo(`${r}.ciudad`, 'Ciudad')}${campo(`${r}.desde`, 'Desde', { placeholder: 'mar 2024' })}${campo(`${r}.hasta`, 'Hasta', { placeholder: 'Actual' })}
          ${campo(`${r}.contacto.nombre`, 'Contacto / jefe inmediato')}${campo(`${r}.contacto.cargo`, 'Cargo del contacto')}${campo(`${r}.contacto.telefono`, 'Teléfono del contacto')}</div>
        <div class="logros">${logros}</div>
        ${soportesDe('experiencia', x.id)}
        <div class="acciones"><button data-mover="experiencia" data-i="${i}" data-d="-1">↑</button><button data-mover="experiencia" data-i="${i}" data-d="1">↓</button><button class="peligro" data-quitar="experiencia" data-i="${i}">Quitar</button></div>
      </div>`;
    }).join('') || '<p class="vacio">Sin experiencia todavía.</p>';
  };

  const LISTAS = {
    educacion: [['titulo', 'Título'], ['institucion', 'Institución'], ['anio', 'Año']],
    certificaciones: [['nombre', 'Certificación o curso'], ['entidad', 'Entidad'], ['anio', 'Año']],
    idiomas: [['idioma', 'Idioma'], ['nivel', 'Nivel']],
    referencias: [['nombre', 'Nombre'], ['cargo', 'Cargo · Empresa'], ['telefono', 'Teléfono']],
    proyectos: [['nombre', 'Proyecto'], ['detalle', 'Resultado (con cifra si la hay)'], ['anio', 'Año']]
  };
  const pintarListas = () => {
    for (const [lista, campos] of Object.entries(LISTAS)) {
      $(`#lista-${lista}`).innerHTML = (datos[lista] ?? []).map((x, i) => `<div class="tarjeta"><div class="rejilla">
          ${campos.map(([c, e]) => campo(`${lista}.${i}.${c}`, e)).join('')}</div>
          ${lista === 'educacion' || lista === 'certificaciones' ? soportesDe(lista, x.id) : ''}
          <div class="acciones"><button data-mover="${lista}" data-i="${i}" data-d="-1">↑</button><button data-mover="${lista}" data-i="${i}" data-d="1">↓</button><button class="peligro" data-quitar="${lista}" data-i="${i}">Quitar</button></div></div>`).join('') || '<p class="vacio">Nada todavía.</p>';
    }
  };

  const soportesDe = (tipo, id) => {
    const lista = (estado.datos.soportes ?? []).filter((s) => s.relacion?.tipo === tipo && s.relacion?.id === id);
    return lista.length ? `<p class="ayuda" style="margin-top:.6rem">📎 Soportes: ${lista.map((s) => `<a href="/api/soportes/${s.id}/archivo?t=${TOKEN}" target="_blank">${esc(s.nombre)}</a>`).join(' · ')}</p>` : '';
  };

  const pintarPerfiles = () => {
    $('#lista-perfiles').innerHTML = clavesPerfiles().map((k) => {
      const r = `perfiles.${k}`;
      const p = datos.perfiles[k];
      const opciones = estado.clases.map((c) => `<option ${c === p.clase ? 'selected' : ''}>${c}</option>`).join('');
      const habilidades = (p.habilidades ?? []).map((g) => `${g.grupo}: ${g.items.join(', ')}`).join('\n');
      return `<div class="tarjeta">
        <h3>${esc(k)} <small class="vacio">· ${esc(p.clase)}</small></h3>
        <div class="rejilla">
          <label>Clase<select data-ruta="${r}.clase">${opciones}</select></label>
          ${campo(`${r}.titulo`, 'Cargo en la firma y la hoja de vida')}
          <label>Color<span class="color"><input type="color" data-ruta="${r}.color" value="${esc(p.color || '#2563eb')}"><code>${esc(p.color)}</code></span></label>
          <label>Firma<select data-ruta="${r}.firma"><option value="cargo" ${p.firma !== 'personal' ? 'selected' : ''}>Con cargo, foto y firma</option><option value="personal" ${p.firma === 'personal' ? 'selected' : ''}>Personal (solo nombre)</option></select></label>
          ${campo(`${r}.saludo`, 'Saludo', { placeholder: 'Buen día, {{DESTINATARIO}}:' })}
          ${campo(`${r}.despedida`, 'Despedida')}
          <label class="checks"><input type="checkbox" data-ruta="${r}.adjuntaHojaDeVida" ${p.adjuntaHojaDeVida ? 'checked' : ''}> Adjunta hoja de vida</label>
          ${campo(`${r}.resumen`, 'Resumen profesional', { area: true, ancho: true })}
          <label class="ancho">Habilidades (una línea por grupo: "Grupo: a, b, c")<textarea data-habilidades="${k}">${esc(habilidades)}</textarea></label>
          ${campo(`${r}.palabrasClave`, 'Palabras clave (separadas por coma)', { ancho: true, lista: ',' })}
          ${campo(`${r}.parrafoCarta`, 'Párrafo de valor de la carta de presentación', { area: true, ancho: true })}
        </div>
        <div class="acciones">${['programador', 'soporte-infraestructura', 'personal'].includes(k) ? '' : `<button class="peligro" data-quitar-perfil="${k}">Quitar perfil</button>`}</div>
      </div>`;
    }).join('');
  };

  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.habilidades;
    if (!k) return;
    datos.perfiles[k].habilidades = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [grupo, ...resto] = l.split(':');
      return { grupo: grupo.trim(), items: resto.join(':').split(',').map((x) => x.trim()).filter(Boolean) };
    });
    marcarSucio();
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset?.ruta && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color')) {
      fijar(el.dataset.ruta, el.type === 'checkbox' ? el.checked : el.value);
      if (el.type === 'color') el.nextElementSibling.textContent = el.value;
      marcarSucio();
    }
  });

  const opcionesRelacion = () => [
    '<option value="general|">General (no ligado)</option>',
    ...(datos.experiencia ?? []).map((x) => `<option value="experiencia|${esc(x.id)}">Experiencia · ${esc(x.empresa)}</option>`),
    ...(datos.educacion ?? []).map((x) => `<option value="educacion|${esc(x.id)}">Educación · ${esc(x.titulo)}</option>`),
    ...(datos.certificaciones ?? []).map((x) => `<option value="certificaciones|${esc(x.id)}">Certificación · ${esc(x.nombre)}</option>`)
  ].join('');

  const pintarSoportes = () => {
    $('#tipo-soporte').innerHTML = Object.entries(estado.tiposSoporte).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('');
    $('#relacion-soporte').innerHTML = opcionesRelacion();
    $('#perfiles-soporte').innerHTML = clavesPerfiles().filter((k) => datos.perfiles[k].firma !== 'personal').map((k) => `<label><input type="checkbox" name="perfil" value="${esc(k)}"> ${esc(datos.perfiles[k].titulo || k)}</label>`).join('');
    const lista = estado.datos.soportes ?? [];
    $('#lista-soportes').innerHTML = lista.length ? `<table><thead><tr><th>Soporte</th><th>Tipo</th><th>Respalda</th><th>Perfiles</th><th></th></tr></thead><tbody>
      ${lista.map((s) => `<tr>
        <td><a href="/api/soportes/${s.id}/archivo?t=${TOKEN}" target="_blank">${esc(s.nombre)}</a><small>${esc(s.archivo)} · ${esc(s.fecha ?? '')}</small>${estado.archivosSoporte[s.id] ? '' : '<small class="falta">Falta el archivo</small>'}</td>
        <td>${esc(estado.tiposSoporte[s.tipo] ?? s.tipo)}</td>
        <td><select data-soporte-relacion="${s.id}">${opcionesRelacion().replace(`value="${s.relacion?.tipo}|${s.relacion?.id ?? ''}"`, `value="${s.relacion?.tipo}|${s.relacion?.id ?? ''}" selected`)}</select></td>
        <td>${s.perfiles?.length ? s.perfiles.map(esc).join(', ') : 'Todos'}</td>
        <td><button class="peligro" data-quitar-soporte="${s.id}">Quitar</button></td></tr>`).join('')}</tbody></table>` : '<p class="vacio">Sin soportes todavía.</p>';
  };

  const pintarEnv = () => {
    $('#campos-env').innerHTML = estado.env.map((c) => `<label>${esc(c.etiqueta)}
      <input name="${c.clave}" type="${c.secreta ? 'password' : 'text'}" autocomplete="off" value="${esc(c.valor)}" placeholder="${c.secreta ? (c.configurada ? '•••••• configurada (vacío = no cambiar)' : 'sin configurar') : ''}">
      <small class="${c.configurada ? '' : 'falta'}">${c.configurada ? 'Configurada' : 'Sin configurar'}</small></label>`).join('');
  };

  const contarPendientes = () => {
    const n = JSON.stringify(datos).split(PEND).length - 1;
    const chip = $('#pendientes');
    chip.textContent = n ? `${n} dato(s) por completar ✏️` : 'Todo completo ✓';
    chip.className = `chip${n ? ' aviso' : ''}`;
  };

  const pintar = () => {
    $('#titulo-nombre').textContent = datos.persona?.nombre || 'Mi perfil';
    pintarContacto(); pintarImagenes(); pintarExperiencia(); pintarListas(); pintarPerfiles(); pintarSoportes(); pintarEnv(); contarPendientes();
  };

  const recibir = (e) => {
    estado = e;
    datos = structuredClone(e.datos);
    sucio = false;
    $('#cambios').hidden = true;
    pintar();
  };

  // ------------------------------------------------------------ acciones
  const idNuevo = (prefijo) => `${prefijo}-${Math.random().toString(36).slice(2, 8)}`;
  const NUEVOS = {
    experiencia: () => ({ id: idNuevo('exp'), empresa: `${PEND} Empresa`, cargo: `${PEND} Cargo`, ciudad: '', desde: `${PEND} mes año`, hasta: 'Actual', logros: { general: [] } }),
    educacion: () => ({ id: idNuevo('edu'), titulo: `${PEND} Título`, institucion: `${PEND} Institución`, anio: '' }),
    certificaciones: () => ({ id: idNuevo('cert'), nombre: `${PEND} Certificación`, entidad: '', anio: '' }),
    idiomas: () => ({ idioma: '', nivel: '' }),
    referencias: () => ({ nombre: `${PEND} Nombre`, cargo: '', telefono: '' }),
    proyectos: () => ({ nombre: `${PEND} Proyecto`, detalle: '', anio: '', perfiles: [] })
  };

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.p && b.closest('#pestanas')) {
      $$('#pestanas button').forEach((x) => x.classList.toggle('activa', x === b));
      $$('.panel').forEach((x) => x.classList.toggle('activa', x.dataset.p === b.dataset.p));
      return;
    }
    const lista = b.dataset.agregar ?? (b.id === 'agregar-exp' ? 'experiencia' : null);
    if (lista) { (datos[lista] ??= []).push(NUEVOS[lista]()); marcarSucio(); pintar(); return; }
    if (b.dataset.quitar) {
      if (!confirm('¿Quitar este registro? (se aplica al guardar)')) return;
      datos[b.dataset.quitar].splice(Number(b.dataset.i), 1); marcarSucio(); pintar(); return;
    }
    if (b.dataset.mover) {
      const arr = datos[b.dataset.mover]; const i = Number(b.dataset.i); const j = i + Number(b.dataset.d);
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]]; marcarSucio(); pintar(); return;
    }
    if (b.id === 'agregar-perfil') {
      const clave = prompt('Clave del perfil nuevo (minúsculas y guiones, p. ej. "analista-datos"):');
      if (!clave) return;
      if (!/^[a-z0-9-]{3,40}$/.test(clave) || datos.perfiles[clave]) return aviso('Clave inválida o repetida.', true);
      datos.perfiles[clave] = { clase: 'Perfil', titulo: `${PEND} Cargo`, color: '#6b7280', firma: 'cargo', adjuntaHojaDeVida: true, saludo: 'Buen día, {{DESTINATARIO}}:', despedida: 'Cordialmente,', resumen: `${PEND} Resumen`, habilidades: [], palabrasClave: [], parrafoCarta: `${PEND} Párrafo de valor` };
      marcarSucio(); pintar(); return;
    }
    if (b.dataset.quitarPerfil) {
      if (!confirm(`¿Quitar el perfil ${b.dataset.quitarPerfil}?`)) return;
      delete datos.perfiles[b.dataset.quitarPerfil]; marcarSucio(); pintar(); return;
    }
    if (b.dataset.quitarSoporte) {
      if (!confirm('¿Quitar este soporte? El archivo pasa a soportes/_papelera.')) return;
      try { recibir(await api('DELETE', `/api/soportes/${b.dataset.quitarSoporte}`)); aviso('Soporte quitado.'); } catch (err) { aviso(err.message, true); }
      return;
    }
    if (b.id === 'guardar') {
      try { recibir(await api('PUT', '/api/datos', { datos })); aviso('Guardado. La versión anterior quedó en config/respaldos.'); } catch (err) { aviso(err.message, true); }
    }
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset?.imagen && el.files?.[0]) {
      try {
        const f = el.files[0];
        recibir(await api('POST', `/api/imagen/${el.dataset.imagen}`, { nombreArchivo: f.name, base64: await leerArchivo(f) }));
        aviso(`${el.dataset.imagen === 'foto' ? 'Foto' : 'Firma'} actualizada.`);
      } catch (err) { aviso(err.message, true); }
      el.value = '';
    }
    if (el.dataset?.soporteRelacion) {
      const [tipo, id] = el.value.split('|');
      try { recibir(await api('PUT', `/api/soportes/${el.dataset.soporteRelacion}`, { relacion: { tipo, id: id || undefined } })); aviso('Soporte actualizado.'); } catch (err) { aviso(err.message, true); }
    }
  });

  $('#form-soporte').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const archivo = f.archivo.files[0];
    if (!archivo) return;
    if (sucio && !confirm('Tienes cambios sin guardar en el formulario; se perderán al subir el soporte. ¿Continuar?')) return;
    const [tipoRel, idRel] = f.relacion.value.split('|');
    try {
      recibir(await api('POST', '/api/soportes', {
        nombreArchivo: archivo.name, base64: await leerArchivo(archivo), nombre: f.nombre.value, tipo: f.tipo.value,
        relacion: { tipo: tipoRel, id: idRel || undefined }, perfiles: $$('input[name=perfil]:checked', f).map((x) => x.value),
        fecha: f.fecha.value, notas: f.notas.value
      }));
      f.reset();
      aviso('Soporte subido.');
    } catch (err) { aviso(err.message, true); }
  });

  $('#form-env').addEventListener('submit', async (e) => {
    e.preventDefault();
    const valores = Object.fromEntries($$('input', e.target).map((i) => [i.name, i.value]));
    try {
      const r = await api('PUT', '/api/env', { valores });
      estado = r; pintarEnv();
      aviso(r.cambiadas.length ? `Guardado en .env: ${r.cambiadas.join(', ')}` : 'No había cambios.');
    } catch (err) { aviso(err.message, true); }
  });

  window.addEventListener('beforeunload', (e) => { if (sucio) { e.preventDefault(); e.returnValue = ''; } });

  $('#ver-hv').href = `/hv?t=${TOKEN}`;
  api('GET', '/api/estado').then(recibir).catch((err) => aviso(`${err.message}`, true));
})();
