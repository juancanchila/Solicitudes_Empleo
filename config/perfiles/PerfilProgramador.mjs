import { Perfil } from '../clases/Perfil.mjs';

/**
 * Perfil para cargos de desarrollo (firma "Desarrollador Backend / Frontend").
 * Los textos (título, resumen, habilidades, carta) se editan en el formulario y viven en config/yo.json.
 * Aquí va solo el comportamiento propio del perfil.
 */
export class PerfilProgramador extends Perfil {
    constructor(datos) {
        super({ color: '#2563eb', ...datos, clave: 'programador', firma: 'cargo', adjuntaHojaDeVida: true });
    }

    /** En postulaciones de desarrollo se adjuntan la hoja de vida y, si existe, el portafolio. */
    adjuntosSugeridos(persona) {
        return persona.soportesPara(this.clave, { tipo: 'portafolio' });
    }
}
