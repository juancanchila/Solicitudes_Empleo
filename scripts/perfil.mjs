// Consulta la configuración orientada a objetos (config/yo.mjs) desde la consola o desde otros scripts.
//
//   node scripts/perfil.mjs --lista                       perfiles disponibles
//   node scripts/perfil.mjs programador --variables       variables para firma y correo (JSON)
//   node scripts/perfil.mjs programador --json            todo para la hoja de vida (JSON)
//   node scripts/perfil.mjs programador --carta "Desarrollador Full Stack" "Empresa X"
//   node scripts/perfil.mjs programador --soportes        soportes del perfil con su ruta (para adjuntar)
//   node scripts/perfil.mjs programador --soportes certificado_laboral   solo de un tipo
//   node scripts/perfil.mjs --validar                     lo que falta por llenar (✏️)
//
// Las rutas de imágenes salen absolutas y solo si el archivo existe. Nunca devuelve claves.

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { juan as yo } from '../config/yo.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imagen = (ruta) => {
    if (!ruta) return '';
    const abs = isAbsolute(ruta) ? ruta : resolve(RAIZ, ruta);
    return existsSync(abs) ? abs : '';
};
const salida = (x) => process.stdout.write(`${JSON.stringify(x, null, 1)}\n`);

const args = process.argv.slice(2);
const opcion = args.find((a) => a.startsWith('--'));
const clave = args.find((a) => !a.startsWith('--'));

try {
    if (opcion === '--lista' || (!clave && !opcion)) {
        for (const p of yo.perfiles) console.log(`${p.clave.padEnd(26)} ${p.titulo || '(sin cargo: solo nombre)'}`);
    } else if (opcion === '--validar') {
        const faltan = [...yo.pendientes(), ...yo.perfiles.flatMap((p) => p.pendientes())];
        const imgs = [
            ...Object.entries(yo.imagenes).filter(([, r]) => !imagen(r)).map(([k, r]) => `imagenes.${k}: no existe ${r}`),
            ...yo.soportes.filter((x) => !x.existe(RAIZ)).map((x) => `soportes.${x.id}: no existe soportes/${x.archivo}`)
        ];
        [...faltan, ...imgs].forEach((f) => console.log(`PENDIENTE  ${f}`));
        console.log(faltan.length + imgs.length ? `\n${faltan.length + imgs.length} dato(s) por completar en config/yo.mjs` : 'Todo completo.');
    } else {
        const perfil = yo.perfil(clave);
        const variables = { ...perfil.variables(), FOTO_RUTA: imagen(yo.imagenes.foto), FIRMA_RUTA: imagen(yo.imagenes.firma) };
        if (opcion === '--variables') salida(variables);
        else if (opcion === '--json') {
            const { experiencia, ...resto } = yo;
            salida({
                persona: yo.contacto(), variables, perfil: perfil.toJSON(), experiencia: yo.experienciaPara(perfil),
                educacion: resto.educacion, certificaciones: resto.certificaciones, idiomas: resto.idiomas, referencias: resto.referencias,
                proyectos: yo.proyectosPara(perfil),
                pendientes: [...yo.pendientes(), ...perfil.pendientes()]
            });
        } else if (opcion === '--soportes') {
            const tipo = args[args.indexOf('--soportes') + 1];
            salida({
                sugeridos: perfil.adjuntosSugeridos(yo).map((x) => x.id),
                soportes: yo.soportesPara(perfil.clave, tipo && !tipo.startsWith('--') ? { tipo } : {}).map((x) => ({
                    ...x.toJSON(), describe: yo.describirSoporte(x), ruta: x.ruta(RAIZ), existe: x.existe(RAIZ)
                }))
            });
        } else if (opcion === '--carta') {
            const i = args.indexOf('--carta');
            salida(perfil.carta({ cargoOferta: args[i + 1] ?? 'el cargo', empresa: args[i + 2] ?? 'la empresa' }));
        } else throw new Error(`Opción desconocida: ${opcion}`);
    }
} catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
}
