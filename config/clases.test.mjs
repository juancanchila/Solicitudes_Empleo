// Pruebas de las clases de configuración:  node --test config/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Perfil } from './clases/Perfil.mjs';
import { Persona } from './clases/Persona.mjs';
import { Soporte } from './clases/Soporte.mjs';
import { construirPersona, leerDatos } from './yo.mjs';
import { PerfilPersonal } from './perfiles/PerfilPersonal.mjs';
import { PerfilProgramador } from './perfiles/PerfilProgramador.mjs';

const base = () => ({
    nombre: 'Ana María Ruiz', correo: 'ana@x.co', telefono: '300 111 2222', whatsapp: '573001112222', ciudad: '✏️ ciudad',
    redes: { github: 'https://github.com/ana' }, imagenes: {},
    experiencia: [
        { id: 'e1', empresa: 'Acme', cargo: 'Dev', logros: { programador: ['Hice la API'], general: ['Algo general'] } },
        { id: 'e2', empresa: '✏️ Empresa', cargo: '', logros: {} }
    ],
    soportes: [
        { id: 's1', nombre: 'Certificado Acme', tipo: 'certificado_laboral', archivo: 'a.pdf', relacion: { tipo: 'experiencia', id: 'e1' }, perfiles: ['programador'] },
        { id: 's2', nombre: 'Cédula', tipo: 'identidad', archivo: 'c.pdf' }
    ]
});

test('Persona: contacto limpio, iniciales, WhatsApp y pendientes', () => {
    const p = new Persona(base());
    assert.equal(p.iniciales, 'AM');
    assert.equal(p.whatsappUrl, 'https://wa.me/573001112222');
    assert.equal(p.contacto().ciudad, '');               // ✏️ no se imprime
    assert.ok(p.pendientes().includes('ciudad'));
    assert.throws(() => new Persona({ nombre: '' }));
});

test('Perfiles: herencia, logros por perfil y firma', () => {
    const p = new Persona(base()).agregarPerfil(new PerfilProgramador({ titulo: 'Desarrolladora', parrafoCarta: 'Valor' })).agregarPerfil(new PerfilPersonal());
    const prog = p.perfil('programador');
    assert.ok(prog instanceof Perfil);
    assert.equal(prog.firma, 'cargo');
    assert.deepEqual(p.experienciaPara(prog).map((x) => x.logros), [['Hice la API']]); // la empresa ✏️ no sale
    assert.deepEqual(p.experienciaPara(p.perfil('personal'))[0].logros, ['Algo general']);
    assert.equal(p.perfil('personal').variables().FIRMA_PLANTILLA, 'personal');
    assert.throws(() => p.perfil('personal').carta({}));
    assert.throws(() => p.perfil('no-existe'), /Perfiles: programador, personal/);
    assert.throws(() => p.agregarPerfil(new PerfilPersonal()), /ya existe/);
});

test('Carta: sin doble punto y sin claves en las variables', () => {
    const p = new Persona(base()).agregarPerfil(new PerfilProgramador({ titulo: 'Dev', parrafoCarta: 'Construyo APIs.' }));
    const c = p.perfil('programador').carta({ cargoOferta: 'Full Stack', empresa: 'Acme S.A.S.' });
    assert.ok(c.parrafos[0].includes('Acme S.A.S. Adjunto'));
    assert.ok(c.asunto.includes('Ana María Ruiz'));
    assert.ok(!Object.keys(p.perfil('programador').variables()).some((k) => /PASSWORD|TOKEN/.test(k)));
});

test('Soportes: por perfil, por tipo y descripción', () => {
    const p = new Persona(base());
    assert.deepEqual(p.soportesPara('programador').map((s) => s.id), ['s1', 's2']);   // s2 sirve para todos
    assert.deepEqual(p.soportesPara('soporte-infraestructura').map((s) => s.id), ['s2']);
    assert.deepEqual(p.soportesPara('programador', { tipo: 'identidad' }).map((s) => s.id), ['s2']);
    assert.equal(p.describirSoporte(p.soportes[0]), 'Certificado laboral · Acme');
    assert.throws(() => new Soporte({ id: 'x', archivo: 'x.pdf', tipo: 'raro' }));
});

test('yo.json real: se construye y tiene los tres perfiles', () => {
    const yo = construirPersona(leerDatos());
    assert.deepEqual(yo.clavesPerfiles, ['programador', 'soporte-infraestructura', 'personal']);
    assert.equal(yo.perfil('programador').titulo, 'Desarrollador Backend / Frontend');
    assert.equal(yo.perfil('soporte-infraestructura').titulo, 'Soporte de Infraestructura');
});
