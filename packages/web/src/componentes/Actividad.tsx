import { Link } from 'react-router-dom';
import type { Evento } from '../api';
import { iniciales } from './Marca';

const QUE: Record<string, string> = {
  todolist: 'la lista',
  todo: 'la tarea',
  message: 'el mensaje',
  folder: 'la carpeta',
  upload: 'el archivo',
};

function fechaCorta(dia: unknown) {
  if (typeof dia !== 'string') return '';
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

/** A dónde lleva un evento (o null si lo que tocó ya no existe o está en la papelera). */
export function enlaceDe(projectId: string, e: Evento): string | null {
  const el = e.elemento;
  if (!el || !el.activo) return null;
  const destino = el.type === 'comment' && el.padre ? el.padre : el;
  switch (destino.type) {
    case 'message':
      return `/proyectos/${projectId}/mensajes/${destino.id}`;
    case 'todo':
      return `/proyectos/${projectId}/tareas?tarea=${destino.id}`;
    case 'todolist':
      return `/proyectos/${projectId}/tareas`;
    default:
      return null;
  }
}

/** La frase del evento, sin el nombre de quien lo hizo: "completó la tarea «Logo»". */
export function frase(e: Evento): string {
  const el = e.elemento;
  const nombre = (t: string | null | undefined) => `«${t || 'sin título'}»`;
  const quienes = e.detalles.personas.join(', ');
  if (!el) {
    switch (e.action) {
      case 'created': return 'creó el proyecto';
      case 'updated': return 'editó los datos del proyecto';
      case 'archived': return 'archivó el proyecto';
      case 'unarchived': return 'reactivó el proyecto';
      case 'trashed': return 'mandó el proyecto a la papelera';
      case 'restored': return 'restauró el proyecto';
      case 'member_added': return `sumó a ${quienes} al proyecto`;
      case 'member_removed': return `quitó a ${quienes} del proyecto`;
      default: return 'hizo un cambio en el proyecto';
    }
  }
  if (el.type === 'comment') {
    const sobre = el.padre ? `${QUE[el.padre.type] ?? ''} ${nombre(el.padre.title)}`.trim() : '';
    if (e.action === 'created') return `comentó en ${sobre}`;
    if (e.action === 'trashed') return `borró un comentario en ${sobre}`;
    return `editó un comentario en ${sobre}`;
  }
  const algo = `${QUE[el.type] ?? ''} ${nombre(el.title)}`.trim();
  switch (e.action) {
    case 'created': return el.type === 'message' ? `publicó ${algo}` : el.type === 'todo' ? `agregó ${algo}` : `creó ${algo}`;
    case 'updated': return `editó ${algo}`;
    case 'completed': return `completó ${algo}`;
    case 'reopened': return `reabrió ${algo}`;
    case 'assigned': return `asignó ${algo} a ${quienes}`;
    case 'unassigned': return `quitó a ${quienes} de ${algo}`;
    case 'due_changed': return e.detalles.to ? `puso fecha ${fechaCorta(e.detalles.to)} a ${algo}` : `quitó la fecha de ${algo}`;
    case 'moved': return `movió ${algo}`;
    case 'trashed': return `mandó a la papelera ${algo}`;
    case 'restored': return `restauró ${algo}`;
    case 'visibility_changed': return e.detalles.to ? `hizo visible para el cliente ${algo}` : `hizo interno ${algo}`;
    default: return `cambió ${algo}`;
  }
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
const dia = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** Lista de eventos agrupados por día. */
export default function ListaActividad({ eventos, projectId }: { eventos: Evento[]; projectId: string }) {
  const grupos: { dia: string; eventos: Evento[] }[] = [];
  for (const e of eventos) {
    const d = dia(e.createdAt);
    if (grupos.at(-1)?.dia !== d) grupos.push({ dia: d, eventos: [] });
    grupos.at(-1)!.eventos.push(e);
  }
  return (
    <div className="actividad">
      {grupos.map((g) => (
        <section key={g.dia}>
          <h4 className="actividad-dia">{g.dia}</h4>
          <ul>
            {g.eventos.map((e) => {
              const a = enlaceDe(projectId, e);
              const texto = (
                <>
                  <b>{e.actor.name}</b> {frase(e)}
                </>
              );
              return (
                <li key={e.id} className="evento-fila">
                  <span className="avatar gris">{iniciales(e.actor.name)}</span>
                  <div className="evento-texto">
                    {a ? <Link to={a}>{texto}</Link> : <span>{texto}</span>}
                    {e.elemento?.extracto && <div className="meta extracto">“{e.elemento.extracto}”</div>}
                  </div>
                  <span className="meta evento-hora">{hora(e.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
