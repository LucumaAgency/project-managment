/** Día 14: búsqueda — tildes, prefijos, papelera y, sobre todo, lo que cada quien puede encontrar. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { fragmento, marcar, sinTildes, terminos } from '../src/lib/busqueda.js';
import { crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, unirACuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let fuera: Cliente; // member de la cuenta que no está en el proyecto
let p: string;
const ids: Record<string, string> = {};

const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const buscar = async (quien: Cliente, q: string) => (await quien.get(`/buscar?q=${encodeURIComponent(q)}`)).json;
const encontrados = async (quien: Cliente, q: string) => (await buscar(quien, q)).resultados.map((r: { id: string }) => r.id) as string[];

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  const u = await prismaAdmin.user.create({ data: { email: `fuera-${A.slug}@test.pe`, name: 'Fuera' } });
  await unirACuenta(u.id, A.accountId, 'member');
  const s = async (id: string, slug = A.slug) => cliente(app, (await crearSesion(id)).token, slug);
  [owner, member, client, fuera] = await Promise.all([s(A.ownerId), s(A.memberId), s(A.clientId), s(u.id)]);
  p = (await owner.post('/proyectos', { name: 'Campaña Verano' })).json.proyecto.id;
  for (const userId of [A.memberId, A.clientId]) await owner.post(`/proyectos/${p}/personas`, { userId });

  const nuevo = async (datos: object) => (await member.post(`/proyectos/${p}/elementos`, datos)).json.elemento.id as string;
  ids.listaVisible = await nuevo({ type: 'todolist', title: 'Entregables', visibleToClients: true });
  ids.listaInterna = await nuevo({ type: 'todolist', title: 'Interno' });
  ids.tareaVisible = (await member.post(`/listas/${ids.listaVisible}/tareas`, { title: 'Diseño del logotipo', visibleToClients: true })).json.tarea.id;
  ids.tareaInterna = (await member.post(`/listas/${ids.listaVisible}/tareas`, { title: 'Diseño de presupuesto interno' })).json.tarea.id;
  ids.tareaEnInterna = (await member.post(`/listas/${ids.listaInterna}/tareas`, { title: 'Diseño escondido', visibleToClients: true })).json.tarea.id;
  ids.msg = await nuevo({ type: 'message', title: 'Kickoff', visibleToClients: true, body: doc('Hablamos del calendario de publicaciones y del diseño de la portada.') });
  ids.comentario = (await member.post(`/elementos/${ids.tareaVisible}/comentarios`, { body: doc('Te paso la paleta naranja') })).json.comentario.id;
  ids.borrado = await nuevo({ type: 'message', title: 'Diseño descartado' });
  await member.post(`/elementos/${ids.borrado}/papelera`);
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('piezas puras', () => {
  it('normaliza como la base y arma términos seguros', () => {
    expect(sinTildes('DISEÑO Árbol')).toBe('diseno arbol');
    expect(terminos("  diseño' | & !:* (x)")).toEqual(['diseno', 'x']);
    expect(marcar('El Diseño y el diseñador', ['dise'])).toEqual([[3, 7], [15, 19]]);
    expect(marcar('prediseño', ['dise'])).toEqual([]);
    const f = fragmento('a '.repeat(100) + 'aquí está la palabra clave y sigue', ['clave'])!;
    expect(f.texto.startsWith('… ')).toBe(true);
    const [a, b] = f.marcas[0];
    expect(f.texto.slice(a, b)).toBe('clave');
  });
});

describe('qué encuentra', () => {
  it('sin tildes y a medio escribir; con el fragmento marcado', async () => {
    expect(await encontrados(member, 'diseno logo')).toEqual([ids.tareaVisible]);
    const r = await buscar(member, 'calend');
    const m = r.resultados.find((x: { id: string }) => x.id === ids.msg);
    const [a, b] = m.fragmento.marcas[0];
    expect(m.fragmento.texto.slice(a, b)).toBe('calend');
    expect(m.proyecto.name).toBe('Campaña Verano');
  });

  it('un comentario abre lo comentado', async () => {
    const [r] = (await buscar(member, 'naranja')).resultados;
    expect(r).toMatchObject({ id: ids.comentario, type: 'comment', abre: { id: ids.tareaVisible, type: 'todo' } });
    expect(r.titulo.texto).toContain('Diseño del logotipo');
  });

  it('lo que está en la papelera (o su padre) no aparece', async () => {
    expect(await encontrados(member, 'descartado')).toEqual([]);
    await member.post(`/elementos/${ids.listaInterna}/papelera`);
    expect(await encontrados(member, 'escondido')).toEqual([]);
    await member.post(`/elementos/${ids.listaInterna}/restaurar`);
    expect(await encontrados(member, 'escondido')).toEqual([ids.tareaEnInterna]);
  });

  it('proyectos por nombre', async () => {
    expect((await buscar(member, 'campana')).proyectos.map((x: { id: string }) => x.id)).toEqual([p]);
  });

  it('búsquedas vacías o de una letra no consultan nada', async () => {
    expect((await buscar(member, 'd')).resultados).toEqual([]);
    expect((await buscar(member, '  &|! ')).resultados).toEqual([]);
  });
});

describe('quién encuentra qué', () => {
  it('el cliente: solo lo visible, con la cadena entera visible', async () => {
    const r = await encontrados(client, 'diseno');
    expect(r).toContain(ids.tareaVisible);
    expect(r).toContain(ids.msg);
    expect(r).not.toContain(ids.tareaInterna);
    expect(r).not.toContain(ids.tareaEnInterna); // marcada visible pero dentro de una lista interna
    expect(r).not.toContain(ids.borrado);
    // El comentario del equipo en una tarea visible es visible (hereda), y la búsqueda lo trae.
    expect(await encontrados(client, 'naranja')).toEqual([ids.comentario]);
    expect(JSON.stringify(await buscar(client, 'presupuesto'))).not.toContain('presupuesto interno');
  });

  it('quien no está en el proyecto no encuentra nada de él; el dueño sí', async () => {
    expect(await encontrados(fuera, 'diseno')).toEqual([]);
    expect((await buscar(fuera, 'campana')).proyectos).toEqual([]);
    expect(await encontrados(owner, 'presupuesto')).toEqual([ids.tareaInterna]);
  });

  it('otra cuenta no encuentra nada de esta', async () => {
    const enB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
    // B tiene su propia lista «Diseño» (semilla): encuentra la suya y nada de A.
    const r = await encontrados(enB, 'diseno');
    expect(r.filter((id) => Object.values(ids).includes(id))).toEqual([]);
    const deB = await prismaAdmin.recording.findMany({ where: { id: { in: r } }, select: { accountId: true } });
    expect(deB.every((x) => x.accountId === B.accountId)).toBe(true);
  });

  it('pasar a interno lo saca de la búsqueda del cliente', async () => {
    await member.patch(`/elementos/${ids.listaVisible}`, { visibleToClients: false });
    expect(await encontrados(client, 'logotipo')).toEqual([]);
    expect(await encontrados(client, 'naranja')).toEqual([]);
    await member.patch(`/elementos/${ids.listaVisible}`, { visibleToClients: true });
    expect(await encontrados(client, 'logotipo')).toEqual([ids.tareaVisible]);
  });
});
