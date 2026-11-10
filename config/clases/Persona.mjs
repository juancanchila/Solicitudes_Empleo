// La persona dueña del agente: datos de contacto, trayectoria y sus perfiles.
// Los perfiles (Programador, Soporte, Personal…) son clases que heredan de Perfil.

import { Soporte } from './Soporte.mjs';
import { buscarPendientes, valor } from './utilidades.mjs';

export class Persona {
    #perfiles = new Map();

    /**
     * @param {object} datos
     * @param {string} datos.nombre        nombre completo como va en la firma y la hoja de vida
     * @param {string} datos.nombreCorto   cómo firma con familia y amigos
     * @param {string} datos.correo        correo que se muestra (el de envío va en el .env)
     * @param {string} datos.telefono      como se lee: "301 388 1688"
     * @param {string} datos.whatsapp      con indicativo, solo números: "573013881688"
     * @param {object} datos.redes         { linkedin, github, portafolio }
     * @param {object} datos.imagenes      { foto, firma } rutas relativas a la carpeta del agente
     * @param {Array}  datos.experiencia   [{ id, empresa, cargo, ciudad, desde, hasta, logros: { <clavePerfil>: [...] } }]
     */
    constructor({
        nombre, nombreCorto, correo, telefono, whatsapp, ciudad, documento,
        redes = {}, imagenes = {}, experiencia = [], educacion = [], certificaciones = [], idiomas = [], referencias = [], proyectos = [], soportes = []
    }) {
        if (!valor(nombre)) throw new Error('La persona necesita un nombre.');
        Object.assign(this, { nombre, nombreCorto, correo, telefono, whatsapp, ciudad, documento, redes, imagenes });
        Object.assign(this, { experiencia, educacion, certificaciones, idiomas, referencias, proyectos });
        this.soportes = soportes.map((x) => (x instanceof Soporte ? x : new Soporte(x)));
    }

    /**
     * Soportes que sirven para un perfil. Filtros opcionales: tipo, relación ('experiencia', 'educacion'…) e id.
     * Ej.: juan.soportesPara('programador', { tipo: 'certificado_laboral' })
     */
    soportesPara(clavePerfil, { tipo, relacion, id } = {}) {
        return this.soportes.filter((s) => s.aplicaA(clavePerfil)
            && (!tipo || s.tipo === tipo)
            && (!relacion || s.relacion?.tipo === relacion)
            && (!id || s.relacion?.id === id));
    }

    /** Nombre legible de lo que respalda un soporte ("Certificado laboral · IPS FUSA S.A.S."). */
    describirSoporte(s) {
        const lista = { experiencia: this.experiencia, educacion: this.educacion, certificaciones: this.certificaciones }[s.relacion?.tipo] ?? [];
        const x = lista.find((y) => y.id === s.relacion?.id);
        const de = x ? valor(x.empresa ?? x.titulo ?? x.nombre) : '';
        return de ? `${s.tipoTexto} · ${de}` : s.tipoTexto;
    }

    /** Registra un perfil (instancia de una subclase de Perfil). Encadenable. */
    agregarPerfil(perfil) {
        if (this.#perfiles.has(perfil.clave)) throw new Error(`El perfil "${perfil.clave}" ya existe.`);
        perfil.persona = this;
        this.#perfiles.set(perfil.clave, perfil);
        return this;
    }

    perfil(clave) {
        const p = this.#perfiles.get(clave);
        if (!p) throw new Error(`No existe el perfil "${clave}". Perfiles: ${this.clavesPerfiles.join(', ')}`);
        return p;
    }

    get perfiles() { return [...this.#perfiles.values()]; }
    get clavesPerfiles() { return [...this.#perfiles.keys()]; }

    get iniciales() {
        return this.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    }

    /** WhatsApp como se lee: "300 440 7026" (sin el indicativo 57). */
    get whatsappTexto() {
        const d = valor(this.whatsapp).replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '');
        return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
    }

    /** Proyectos destacados que aplican a un perfil (vacío en "perfiles" = todos). */
    proyectosPara(perfil) {
        return this.proyectos.filter((x) => valor(x.nombre) && (!x.perfiles?.length || x.perfiles.includes(perfil.clave)));
    }

    get whatsappUrl() { return valor(this.whatsapp) ? `https://wa.me/${valor(this.whatsapp).replace(/\D/g, '')}` : ''; }

    /** Experiencia con los logros que corresponden a un perfil (o los "general" si el perfil no tiene propios). */
    experienciaPara(perfil) {
        return this.experiencia
            .filter((x) => valor(x.empresa))
            .map(({ logros = {}, ...x }) => ({ ...x, logros: (logros[perfil.clave] ?? logros.general ?? []).filter((l) => valor(l)) }));
    }

    /** Datos de contacto limpios (sin lo que sigue pendiente). */
    contacto() {
        return {
            nombre: this.nombre, nombreCorto: valor(this.nombreCorto) || this.nombre.split(' ')[0],
            correo: valor(this.correo), telefono: valor(this.telefono), whatsapp: valor(this.whatsapp), whatsappUrl: this.whatsappUrl, whatsappTexto: this.whatsappTexto,
            ciudad: valor(this.ciudad), documento: valor(this.documento),
            linkedin: valor(this.redes.linkedin), github: valor(this.redes.github), portafolio: valor(this.redes.portafolio),
            iniciales: this.iniciales
        };
    }

    /** Todo lo que falta por llenar (marcado con ✏️). */
    pendientes() {
        const { nombre, nombreCorto, correo, telefono, whatsapp, ciudad, redes, imagenes, experiencia, educacion, certificaciones, idiomas, referencias, proyectos } = this;
        return buscarPendientes({ nombre, nombreCorto, correo, telefono, whatsapp, ciudad, redes, imagenes, experiencia, educacion, certificaciones, idiomas, referencias, proyectos });
    }
}
