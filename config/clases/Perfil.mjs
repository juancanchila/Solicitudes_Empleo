// Clase base de un perfil. Cada cargo al que postulas es una subclase (config/perfiles/).

import { buscarPendientes, llenar, valor } from './utilidades.mjs';

export class Perfil {
    /** @type {import('./Persona.mjs').Persona | null} lo asigna Persona.agregarPerfil */
    persona = null;

    /**
     * @param {object} p
     * @param {string} p.clave           identificador corto: "programador"
     * @param {string} p.titulo          lo que dice la firma y la hoja de vida: "Desarrollador Backend / Frontend"
     * @param {string} p.color           color del perfil en firma y hoja de vida
     * @param {'cargo'|'personal'} p.firma  plantilla de firma: con cargo o solo nombre
     * @param {boolean} p.adjuntaHojaDeVida si el correo normalmente lleva hoja de vida
     */
    constructor({ clave, titulo, color = '#2563eb', resumen = '', habilidades = [], palabrasClave = [], firma = 'cargo', adjuntaHojaDeVida = true, saludo, despedida, parrafoCarta = '' }) {
        if (!clave) throw new Error('Un perfil necesita una clave.');
        Object.assign(this, { clave, titulo, color, resumen, habilidades, palabrasClave, firma, adjuntaHojaDeVida, parrafoCarta });
        this.saludo = saludo ?? 'Buen día, {{DESTINATARIO}}:';
        this.despedida = despedida ?? 'Cordialmente,';
    }

    /** Soportes que este perfil adjunta por defecto en una postulación (las subclases lo especializan). */
    adjuntosSugeridos() {
        return [];
    }

    /** Párrafo de valor de la carta (se edita en el formulario). Una subclase puede sobrescribirlo. */
    parrafoValor() {
        return this.parrafoCarta;
    }

    /**
     * Carta de presentación para una oferta.
     * @param {{ cargoOferta: string, empresa: string, parrafoEmpresa?: string }} oferta
     */
    carta({ cargoOferta, empresa, parrafoEmpresa = '' }) {
        const v = { CARGO_OFERTA: cargoOferta, EMPRESA: empresa, NOMBRE: this.persona?.nombre ?? '' };
        return {
            asunto: llenar('Postulación al cargo de {{CARGO_OFERTA}} – {{NOMBRE}}', v),
            parrafos: [
                // "Acme S.A.S." ya termina en punto: no se duplica
                `${llenar('Me permito presentar mi postulación al cargo de {{CARGO_OFERTA}} en {{EMPRESA}}', v)}${/\.$/.test(empresa) ? '' : '.'} Adjunto mi hoja de vida.`,
                llenar(this.parrafoValor(), v),
                parrafoEmpresa,
                'Quedo atento a una entrevista en el horario que les quede mejor.'
            ].filter((p) => valor(p))
        };
    }

    /** Variables para las plantillas (firma y correo). Nunca incluye claves. */
    variables() {
        const c = this.persona?.contacto() ?? {};
        return {
            PERFIL: this.clave, CARGO_TITULO: valor(this.titulo), COLOR: this.color, FIRMA_PLANTILLA: this.firma,
            NOMBRE: c.nombre ?? '', NOMBRE_CORTO: c.nombreCorto ?? '', CORREO: c.correo ?? '', TELEFONO: c.telefono ?? '',
            WHATSAPP: c.whatsapp ?? '', WHATSAPP_URL: c.whatsappUrl ?? '', WHATSAPP_TEXTO: c.whatsappTexto ?? '', CIUDAD: c.ciudad ?? '',
            LINKEDIN: c.linkedin ?? '', GITHUB: c.github ?? '', PORTAFOLIO: c.portafolio ?? '',
            FOTO_RUTA: valor(this.persona?.imagenes?.foto), FIRMA_RUTA: valor(this.persona?.imagenes?.firma),
            SALUDO: this.saludo, DESPEDIDA: this.despedida
        };
    }

    pendientes() {
        const { titulo, resumen, habilidades, palabrasClave } = this;
        return buscarPendientes({ titulo, resumen, habilidades, palabrasClave, carta: this.parrafoValor() }).map((r) => `${this.clave}.${r}`);
    }

    toJSON() {
        return {
            clave: this.clave, titulo: valor(this.titulo), color: this.color, firma: this.firma, adjuntaHojaDeVida: this.adjuntaHojaDeVida,
            resumen: valor(this.resumen),
            habilidades: this.habilidades.filter((g) => valor(g.grupo)).map((g) => ({ grupo: g.grupo, items: g.items.filter((i) => valor(i)) })),
            palabrasClave: this.palabrasClave.filter((p) => valor(p))
        };
    }
}
