// Un soporte es un archivo que respalda la hoja de vida: diploma, certificado laboral, certificación,
// documento de identidad, carta de recomendación… Vive en soportes/ y se relaciona con una experiencia,
// un estudio o una certificación, y con los perfiles para los que sirve.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const TIPOS_SOPORTE = {
    diploma: 'Diploma o acta de grado',
    certificado_laboral: 'Certificado laboral',
    certificacion: 'Certificación o curso',
    identidad: 'Documento de identidad',
    recomendacion: 'Carta de recomendación',
    portafolio: 'Portafolio o muestra de trabajo',
    otro: 'Otro'
};

export class Soporte {
    /**
     * @param {{ id: string, nombre: string, tipo: keyof TIPOS_SOPORTE, archivo: string,
     *           relacion?: { tipo: 'experiencia'|'educacion'|'certificaciones'|'general', id?: string },
     *           perfiles?: string[], fecha?: string, notas?: string }} datos
     */
    constructor({ id, nombre, tipo = 'otro', archivo, relacion = { tipo: 'general' }, perfiles = [], fecha, notas = '' }) {
        if (!id || !archivo) throw new Error('Un soporte necesita id y archivo.');
        if (!TIPOS_SOPORTE[tipo]) throw new Error(`Tipo de soporte desconocido: ${tipo}`);
        Object.assign(this, { id, nombre: nombre || archivo, tipo, archivo, relacion, perfiles, fecha, notas });
    }

    get tipoTexto() { return TIPOS_SOPORTE[this.tipo]; }

    /** Vacío en "perfiles" = sirve para todos los perfiles. */
    aplicaA(clavePerfil) { return !this.perfiles.length || this.perfiles.includes(clavePerfil); }

    ruta(raiz) { return resolve(raiz, 'soportes', this.archivo); }

    existe(raiz) { return existsSync(this.ruta(raiz)); }

    toJSON() {
        const { id, nombre, tipo, archivo, relacion, perfiles, fecha, notas } = this;
        return { id, nombre, tipo, archivo, relacion, perfiles, fecha, notas };
    }
}
