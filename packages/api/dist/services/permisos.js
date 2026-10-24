/**
 * Quién puede hacer qué DENTRO de una cuenta. RLS ya cuida la frontera entre cuentas; aquí
 * se decide por rol, por membresía en el proyecto y por visibilidad para clientes.
 *
 * Regla de la casa: las rutas no deciden permisos sueltos. Cargan el contexto (proyecto,
 * elemento) con `services/proyectos.ts` y `services/elementos.ts` y preguntan a `puede()`.
 *
 * `puede()` es una función pura: recibe todo lo que necesita y no toca la base, así se
 * prueba sola y no hay consultas escondidas.
 */
import { esCliente, veTodosLosProyectos } from '@lucuma-pm/shared';
import { HttpError } from '../lib/errores.js';
const gestiona = (rol) => veTodosLosProyectos(rol); // owner y admin
/** Tipos que edita cualquiera del equipo del proyecto, no solo quien los creó. */
export const DEL_EQUIPO = ['todolist', 'todo'];
/** Qué tipos puede crear un cliente. Lo que crea nace visible para clientes. */
export const TIPOS_DE_CLIENTE = ['todo', 'message', 'comment'];
export function puede(actor, accion, sobre = {}) {
    const { rol } = actor;
    const cliente = esCliente(rol);
    const p = sobre.proyecto;
    const e = sobre.elemento;
    if (accion === 'proyecto.crear')
        return !cliente;
    if (!p)
        return false;
    const veProyecto = p.status === 'trashed' ? gestiona(rol) : gestiona(rol) || p.esMiembro;
    if (!veProyecto)
        return false;
    const activo = p.status === 'active';
    switch (accion) {
        case 'proyecto.ver':
            return true;
        case 'proyecto.editar':
            return activo && (gestiona(rol) || (!cliente && p.esMiembro));
        case 'proyecto.archivar':
        case 'proyecto.papelera':
            return gestiona(rol);
        case 'proyecto.personas':
            return activo && (gestiona(rol) || (!cliente && p.esMiembro));
        case 'proyecto.verPapelera':
            return gestiona(rol);
    }
    // --- elementos: el proyecto tiene que verse; archivado = solo lectura
    if (accion === 'elemento.crear') {
        if (!activo)
            return false;
        if (cliente && (!sobre.tipo || !TIPOS_DE_CLIENTE.includes(sobre.tipo)))
            return false;
        // Crear dentro de un padre: el padre tiene que verse (lo revisa elemento.ver del padre).
        return !e || puede(actor, 'elemento.ver', { proyecto: p, elemento: e });
    }
    if (!e)
        return false;
    const veElemento = !e.padreInactivo && (!cliente || e.visibleEnCadena);
    if (accion === 'elemento.ver')
        return veElemento && (e.status === 'active' || gestiona(rol) || e.creatorId === actor.ctx.userId);
    if (!veElemento || !activo)
        return false;
    const esCreador = e.creatorId === actor.ctx.userId;
    switch (accion) {
        case 'elemento.editar':
            // Listas y tareas son del equipo: cualquiera del proyecto (no clientes) las edita.
            // Mensajes y comentarios son de quien los escribió.
            return e.status === 'active' && (gestiona(rol) || esCreador || (!cliente && p.esMiembro && DEL_EQUIPO.includes(e.type)));
        case 'elemento.papelera':
            return gestiona(rol) || esCreador;
        case 'elemento.cambiarVisibilidad':
            return e.status === 'active' && !cliente && e.type !== 'comment';
    }
    return false;
}
/**
 * Corta si no puede. Cuando ni siquiera puede VER, responde 404 y no 403: así no revela que
 * el proyecto o el elemento existen.
 */
export function exigir(actor, accion, sobre = {}, mensaje) {
    if (puede(actor, accion, sobre))
        return;
    const ve = accion === 'proyecto.crear' ||
        (sobre.proyecto && puede(actor, 'proyecto.ver', { proyecto: sobre.proyecto }) &&
            // Para crear, `elemento` es el padre: si no se ve el padre, tampoco se revela.
            (!sobre.elemento || puede(actor, 'elemento.ver', { proyecto: sobre.proyecto, elemento: sobre.elemento })));
    if (!ve)
        throw new HttpError(404, 'No encontrado.');
    throw new HttpError(403, mensaje ?? 'No tienes permiso para hacer esto.');
}
