"""Genera la hoja de vida de un cargo (HTML + PDF) sin logos ni marca de empresa.

Uso:
    python -I scripts/generar_hoja_de_vida.py programador
    python -I scripts/generar_hoja_de_vida.py soporte-infraestructura --sin-pdf
    python -I scripts/generar_hoja_de_vida.py programador --ajuste salida/2026-11-10_acme_ajuste.json --nombre acme

  --ajuste  JSON con lo que cambia SOLO para una oferta (no toca config/yo.json):
            { "titulo": "...", "resumen": "...", "habilidades_primero": ["Angular", "SQL Server"], "palabras_clave": [...] }
            El agente lo arma desde la oferta usando solo lo que ya está en el perfil (nunca inventa).
  --nombre  sufijo del archivo: salida/hoja-de-vida_<perfil>_<nombre>.pdf
  --stdout  escribe el HTML en la salida estándar (lo usa scripts/editor.mjs para la vista en vivo; no guarda archivos)

Lee la configuración orientada a objetos con `node scripts/perfil.mjs <perfil> --json`:
    config/yo.mjs                     la Persona: contacto, foto, experiencia, educación, idiomas, referencias
    config/perfiles/Perfil*.mjs       la clase del perfil: título, color, resumen, habilidades y logros a resaltar
Escribe:
    salida/hoja-de-vida_<cargo>.html y .pdf (el PDF con Edge o Chrome en modo headless)
"""
import base64
import html
import json
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
NAVEGADORES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
]


def leer_config(perfil):
    r = subprocess.run(["node", str(RAIZ / "scripts" / "perfil.mjs"), perfil, "--json"], capture_output=True, timeout=60)
    if r.returncode:
        sys.exit(r.stderr.decode("utf-8", "replace").strip() or "No se pudo leer la configuración")
    return json.loads(r.stdout.decode("utf-8"))


def e(v):
    return html.escape(str(v or ""))


def pendiente(v):
    """Lo marcado con ✏️ no se imprime (queda resaltado en el HTML para completarlo)."""
    return "✏️" in str(v)


def imagen_base64(ruta):
    ruta = Path(ruta) if ruta else None
    if ruta and ruta.is_file():
        tipo = "image/png" if ruta.suffix.lower() == ".png" else "image/jpeg"
        return f"data:{tipo};base64,{base64.b64encode(ruta.read_bytes()).decode()}"
    return None


def aplicar_ajuste(perfil, ajuste):
    """Ajuste por oferta: título y resumen propios y las habilidades pedidas primero (solo reordena, no agrega)."""
    if not ajuste:
        return perfil
    perfil = dict(perfil)
    for clave in ("titulo", "resumen"):
        if ajuste.get(clave):
            perfil[clave] = ajuste[clave]
    primero = [h.lower() for h in ajuste.get("habilidades_primero", [])]
    if primero:
        peso = lambda item: next((i for i, h in enumerate(primero) if h in item.lower()), len(primero))
        grupos = [{**g, "items": sorted(g["items"], key=peso)} for g in perfil["habilidades"]]
        perfil["habilidades"] = sorted(grupos, key=lambda g: min([peso(i) for i in g["items"]] or [len(primero)]))
    return perfil


def armar(cargo, ajuste=None):
    datos = leer_config(cargo)
    persona, variables = datos["persona"], datos["variables"]
    perfil = aplicar_ajuste(datos["perfil"], ajuste)
    if not perfil.get("adjuntaHojaDeVida", True):
        sys.exit(f"El perfil '{cargo}' no lleva hoja de vida.")
    color = perfil.get("color", "#2563eb")
    nombre = persona["nombre"]
    avisos = [f"{p} (config/yo.mjs o la clase del perfil)" for p in datos.get("pendientes", [])]

    foto = imagen_base64(variables.get("FOTO_RUTA"))
    if not foto:
        avisos.append("Sin foto: revisa imagenes.foto en config/yo.mjs")
    foto_html = f'<img class="foto" src="{foto}" alt="">' if foto else f'<div class="foto sin">{e(persona["iniciales"])}</div>'

    contacto = []
    for clave, etiqueta in (("correo", "Correo"), ("telefono", "Celular"), ("whatsappTexto", "WhatsApp"), ("ciudad", "Ciudad")):
        if persona.get(clave):
            contacto.append(f'<li><span>{etiqueta}</span>{e(persona[clave])}</li>')
    for clave, etiqueta in (("linkedin", "LinkedIn"), ("github", "GitHub"), ("portafolio", "Portafolio")):
        if persona.get(clave):
            corto = re.sub(r"^https?://(www\.)?", "", persona[clave]).rstrip("/")
            contacto.append(f'<li><span>{etiqueta}</span><a href="{e(persona[clave])}">{e(corto)}</a></li>')
    if persona.get("documento"):
        contacto.append(f'<li><span>Documento</span>{e(persona["documento"])}</li>')

    habilidades = "".join(
        f'<div class="grupo"><h4>{e(g["grupo"])}</h4><div class="chips">'
        + "".join(f"<span>{e(i)}</span>" for i in g["items"] if not pendiente(i))
        + "</div></div>"
        for g in perfil["habilidades"] if not pendiente(g["grupo"])
    )
    idiomas = "".join(f'<li><span>{e(i["idioma"])}</span>{e(i["nivel"])}</li>' for i in datos.get("idiomas", []) if not pendiente(i["nivel"]))

    experiencia = []
    for x in datos.get("experiencia", []):
        logros = x.get("logros", [])
        fechas = " – ".join(v for v in (x.get("desde"), x.get("hasta")) if v and not pendiente(v))
        if not fechas:
            avisos.append(f"Faltan las fechas de {x['empresa']}")
        experiencia.append(
            f'<div class="item"><div class="cab"><div><h3>{e(x["cargo"])}</h3><p class="empresa">{e(x["empresa"])}'
            + (f' · {e(x["ciudad"])}' if x.get("ciudad") and not pendiente(x["ciudad"]) else "")
            + f'</p></div><span class="fecha">{e(fechas)}</span></div>'
            + ("<ul>" + "".join(f"<li>{e(l)}</li>" for l in logros) + "</ul>" if logros else "")
            + "</div>"
        )

    def lista(clave, campos):
        filas = [r for r in datos.get(clave, []) if not any(pendiente(r.get(c)) for c in campos[:1])]
        if not filas:
            avisos.append(f"Sin {clave}: la sección no sale (complétala en config/yo.mjs)")
        return "".join(
            f'<div class="item corto"><h3>{e(r[campos[0]])}</h3><p class="empresa">{e(r.get(campos[1]))}</p>'
            + (f'<span class="fecha">{e(r.get(campos[2]))}</span>' if r.get(campos[2]) and not pendiente(r.get(campos[2])) else "")
            + "</div>"
            for r in filas
        )

    proyectos = "".join(
        f'<li><strong>{e(x["nombre"])}</strong>' + (f': {e(x["detalle"])}' if x.get("detalle") else "")
        + (f' <span class="fecha">· {e(x["anio"])}</span>' if x.get("anio") else "") + "</li>"
        for x in datos.get("proyectos", [])
    )
    def lista_lateral(clave, campos):
        """Educación y certificaciones en la columna izquierda: título en negrita, entidad · año debajo."""
        filas = [r for r in datos.get(clave, []) if not pendiente(r.get(campos[0]))]
        if not filas:
            avisos.append(f"Sin {clave}: la sección no sale (complétala en el formulario)")
        return "".join(
            f'<li><strong>{e(r[campos[0]])}</strong><br>'
            + " · ".join(e(r.get(c)) for c in campos[1:] if r.get(c) and not pendiente(r.get(c)))
            + "</li>"
            for r in filas
        )

    educacion = lista_lateral("educacion", ["titulo", "institucion", "anio"])
    certificaciones = lista_lateral("certificaciones", ["nombre", "entidad", "anio"])
    referencias = "".join(
        f'<li><strong>{e(r["nombre"])}</strong><br>{e(r.get("cargo"))}<br>{e(r.get("telefono"))}</li>'
        for r in datos.get("referencias", []) if not pendiente(r["nombre"])
    ) or "<li>Disponibles a solicitud.</li>"
    resumen = perfil.get("resumen", "")

    pagina = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Hoja de vida · {e(nombre)} · {e(perfil['titulo'])}</title>
<style>
  @page {{ size: A4; margin: 9mm 0 9mm 0; }}
  @page :first {{ margin-top: 0; }}
  * {{ box-sizing: border-box; }}
  html {{ background: linear-gradient(to right, #111827 66mm, #ffffff 66mm); }}
  body {{ margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  .hoja {{ display: grid; grid-template-columns: 66mm 1fr; min-height: 296mm; width: 210mm; margin: 0 auto; }}
  aside {{ background: #111827; color: #e5e7eb; padding: 11mm 7mm 8mm; }}
  main {{ padding: 12mm 11mm 8mm; }}
  .foto {{ width: 30mm; height: 30mm; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 4mm; border: 3px solid {color}; }}
  .foto.sin {{ display: flex; align-items: center; justify-content: center; background: {color}; color: #fff; font-size: 26pt; font-weight: 700; }}
  aside h2 {{ font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; color: #9ca3af; margin: 5mm 0 2mm; border-bottom: 1px solid #374151; padding-bottom: 1.5mm; }}
  aside ul {{ list-style: none; margin: 0; padding: 0; }}
  aside li {{ margin-bottom: 1.6mm; word-break: break-word; font-size: 9.5pt; }}
  aside li span {{ display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; }}
  aside a {{ color: #e5e7eb; text-decoration: none; }}
  .grupo h4 {{ margin: 0 0 1.2mm; font-size: 8.5pt; color: #fff; }}
  .grupo {{ margin-bottom: 2.2mm; }}
  .chips span {{ display: inline-block; background: #1f2937; border: 1px solid #374151; border-radius: 3mm; padding: .2mm 1.6mm; margin: 0 .8mm .9mm 0; font-size: 7.6pt; }}
  h1 {{ font-size: 25pt; margin: 0; line-height: 1.1; color: #111827; }}
  .titulo {{ font-size: 12.5pt; font-weight: 600; color: {color}; margin: 1.5mm 0 5mm; letter-spacing: .02em; }}
  .resumen {{ border-left: 3px solid {color}; padding-left: 4mm; color: #374151; margin-bottom: 4mm; }}
  main h2 {{ font-size: 10pt; text-transform: uppercase; letter-spacing: .14em; color: {color}; margin: 6mm 0 3mm; display: flex; align-items: center; gap: 3mm; }}
  main h2::after {{ content: ''; flex: 1; height: 1px; background: #e5e7eb; }}
  .item {{ margin-bottom: 4mm; break-inside: avoid; }}
  .item .cab {{ display: flex; justify-content: space-between; gap: 4mm; }}
  .item h3 {{ font-size: 11pt; margin: 0; color: #111827; }}
  .empresa {{ margin: 0; color: #4b5563; font-weight: 600; }}
  .fecha {{ color: #6b7280; font-size: 9pt; white-space: nowrap; }}
  .item ul {{ margin: 1.5mm 0 0; padding-left: 4.5mm; }}
  .item li {{ margin-bottom: 1mm; }}
  .corto {{ display: grid; grid-template-columns: 1fr auto; column-gap: 4mm; }}
  .corto .empresa {{ grid-column: 1; font-weight: 400; }}
  .corto .fecha {{ grid-row: 1; grid-column: 2; }}
  aside ul.lateral li {{ font-size: 8.6pt; line-height: 1.35; color: #d1d5db; }}
  aside ul.lateral strong {{ color: #fff; font-weight: 600; }}
  .proyectos {{ margin: 0; padding-left: 4.5mm; }}
  .proyectos li {{ margin-bottom: 1.2mm; break-inside: avoid; }}
  .contacto-ref {{ color: #6b7280; font-size: 8.5pt; }}
  .clave {{ margin-top: 6mm; font-size: 8pt; color: #9ca3af; }}
</style></head>
<body><div class="hoja">
  <aside>
    {foto_html}
    <h2>Contacto</h2><ul>{''.join(contacto)}</ul>
    <h2>Habilidades</h2>{habilidades}
    {f'<h2>Educación</h2><ul class="lateral">{educacion}</ul>' if educacion else ''}
    {f'<h2>Certificaciones</h2><ul class="lateral">{certificaciones}</ul>' if certificaciones else ''}
    {f'<h2>Idiomas</h2><ul>{idiomas}</ul>' if idiomas else ''}
    <h2>Referencias</h2><ul>{referencias}</ul>
  </aside>
  <main>
    <h1>{e(nombre)}</h1>
    <div class="titulo">{e(perfil['titulo'])}</div>
    {f'<p class="resumen">{e(resumen)}</p>' if resumen else ''}
    <h2>Experiencia</h2>{''.join(experiencia)}
    {f'<h2>Proyectos destacados</h2><ul class="proyectos">{proyectos}</ul>' if proyectos else ''}
  </main>
</div></body></html>"""
    return pagina, avisos


def main():
    if len(sys.argv) < 2:
        sys.exit("Uso: python -I scripts/generar_hoja_de_vida.py <perfil>   (perfiles: node scripts/perfil.mjs --lista)")
    cargo = sys.argv[1]
    opcion = lambda n: sys.argv[sys.argv.index(n) + 1] if n in sys.argv and sys.argv.index(n) + 1 < len(sys.argv) else None
    ajuste = json.loads(Path(opcion("--ajuste")).read_text(encoding="utf-8")) if opcion("--ajuste") else None
    sufijo = f"_{re.sub(r'[^a-z0-9-]+', '-', opcion('--nombre').lower())}" if opcion("--nombre") else ""
    pagina, avisos = armar(cargo, ajuste)
    if "--stdout" in sys.argv:
        sys.stdout.buffer.write(pagina.encode("utf-8"))
        for a in dict.fromkeys(avisos):
            sys.stderr.buffer.write(f"PENDIENTE: {a}\n".encode("utf-8"))
        return
    salida = RAIZ / "salida"
    salida.mkdir(exist_ok=True)
    archivo_html = salida / f"hoja-de-vida_{cargo}{sufijo}.html"
    archivo_html.write_text(pagina, encoding="utf-8")
    print(f"HTML: {archivo_html}")
    if "--sin-pdf" not in sys.argv:
        navegador = next((n for n in NAVEGADORES if n.exists()), None)
        if not navegador:
            print("Sin Edge ni Chrome: abre el HTML y usa Imprimir → Guardar como PDF.")
        else:
            archivo_pdf = salida / f"hoja-de-vida_{cargo}{sufijo}.pdf"
            subprocess.run([str(navegador), "--headless", "--disable-gpu", "--no-pdf-header-footer",
                            f"--print-to-pdf={archivo_pdf}", archivo_html.as_uri()], check=True, timeout=120,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"PDF:  {archivo_pdf}")
    for a in dict.fromkeys(avisos):
        print(f"PENDIENTE: {a}")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
