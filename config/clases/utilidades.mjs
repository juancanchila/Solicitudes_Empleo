// Utilidades compartidas por las clases de configuración.

/** Marca de "por completar": lo que la lleva no se imprime y aparece en `pendientes()`. */
export const PENDIENTE = '✏️';

export const esPendiente = (valor) => typeof valor === 'string' && valor.includes(PENDIENTE);

/** Valor limpio: vacío si está pendiente o no existe. */
export const valor = (v) => (v === undefined || v === null || esPendiente(v) ? '' : String(v).trim());

/** Recorre un objeto y devuelve las rutas de todo lo que sigue marcado con ✏️. */
export const buscarPendientes = (objeto, ruta = '') => {
    if (esPendiente(objeto)) return [ruta || '(raíz)'];
    if (Array.isArray(objeto)) return objeto.flatMap((x, i) => buscarPendientes(x, `${ruta}[${i}]`));
    if (objeto && typeof objeto === 'object') {
        return Object.entries(objeto).flatMap(([k, v]) => buscarPendientes(v, ruta ? `${ruta}.${k}` : k));
    }
    return [];
};

/** Reemplaza {{CLAVE}} en un texto con un mapa de variables. */
export const llenar = (texto, variables) => String(texto ?? '').replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in variables ? variables[k] : m));
