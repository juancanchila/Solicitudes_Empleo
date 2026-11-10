// ============================================================
//  Arma el objeto `juan` (Persona) con sus perfiles a partir de config/yo.json.
//  Los DATOS se editan en el formulario: node scripts/editor.mjs (o a mano en yo.json).
//  Aquí solo está el registro de CLASES: cada perfil de yo.json dice qué clase usa.
//  Las claves (Gmail, token de Git) NO van aquí: van en el .env.
// ============================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Perfil } from './clases/Perfil.mjs';
import { Persona } from './clases/Persona.mjs';
import { PerfilPersonal } from './perfiles/PerfilPersonal.mjs';
import { PerfilProgramador } from './perfiles/PerfilProgramador.mjs';
import { PerfilSoporteInfraestructura } from './perfiles/PerfilSoporteInfraestructura.mjs';

export const RUTA_CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), 'yo.json');

/** Clases disponibles. Un perfil nuevo creado en el formulario usa `Perfil` (genérico). */
export const CLASES_PERFIL = { Perfil, PerfilProgramador, PerfilSoporteInfraestructura, PerfilPersonal };

/** Construye la Persona y sus perfiles desde un objeto con la forma de yo.json. */
export const construirPersona = (datos) => {
    const { persona, experiencia, educacion, certificaciones, idiomas, referencias, proyectos, soportes, perfiles } = datos;
    const yo = new Persona({ ...persona, experiencia, educacion, certificaciones, idiomas, referencias, proyectos, soportes });
    for (const [clave, p] of Object.entries(perfiles ?? {})) {
        const Clase = CLASES_PERFIL[p.clase] ?? Perfil;
        yo.agregarPerfil(new Clase({ ...p, clave }));
    }
    return yo;
};

export const leerDatos = () => JSON.parse(readFileSync(RUTA_CONFIG, 'utf8'));

export const juan = construirPersona(leerDatos());
