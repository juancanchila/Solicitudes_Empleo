import { Perfil } from '../clases/Perfil.mjs';

/** Perfil para familia, amigos e instituciones: firma solo con nombre, tono cercano y sin hoja de vida. */
export class PerfilPersonal extends Perfil {
    constructor(datos = {}) {
        super({ saludo: 'Hola, {{DESTINATARIO}}:', despedida: 'Un abrazo,', color: '#374151', ...datos, clave: 'personal', titulo: '', firma: 'personal', adjuntaHojaDeVida: false });
    }

    carta() {
        throw new Error('El perfil personal no tiene carta de presentación.');
    }

    adjuntosSugeridos() {
        return [];
    }
}
