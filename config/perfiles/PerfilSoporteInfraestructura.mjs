import { Perfil } from '../clases/Perfil.mjs';

/**
 * Perfil para cargos de soporte e infraestructura (firma "Soporte de Infraestructura").
 * Los textos se editan en el formulario (config/yo.json).
 */
export class PerfilSoporteInfraestructura extends Perfil {
    constructor(datos) {
        super({ color: '#0f766e', ...datos, clave: 'soporte-infraestructura', firma: 'cargo', adjuntaHojaDeVida: true });
    }

    /** En soporte suelen pedir certificaciones técnicas: se sugieren las del perfil. */
    adjuntosSugeridos(persona) {
        return persona.soportesPara(this.clave, { tipo: 'certificacion' });
    }
}
