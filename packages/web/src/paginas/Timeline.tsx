import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, enlaceLugar, ErrorApi, textoHora, type DatosTimeline, type TareaTimeline } from '../api';
import Icono from '../componentes/Icono';

/** AAAA-MM-DD en la hora local, y aritmética de días sin zonas horarias. */
const hoy = () => new Date().toLocaleDateString('en-CA');
const sumar = (dia: string, n: number) => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d + n).toLocaleDateString('en-CA');
};
const lunesDe = (dia: string) => {
  const [a, m, d] = dia.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return sumar(dia, -((f.getDay() + 6) % 7));
};
const entre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const fechaLarga = (dia: string) => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
};
const fechaCorta = (dia: string) => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
};
const LETRA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function estado(t: TareaTimeline) {
  if (t.completada) return 'hecha';
  if (t.columna?.tipo === 'revision') return 'revision';
  if (t.hasta < hoy()) return 'vencida';
  return 'normal';
}

/**
 * Timeline: las tareas con fecha en una línea de días (o como agenda en el celular). De todos
 * los proyectos que ves o de uno (?proyecto=). Para coordinar shoots y entregas.
 */
export default function Timeline() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const proyecto = params.get('proyecto') ?? '';
  const [inicio, setInicio] = useState(() => lunesDe(hoy()));
  const [semanas, setSemanas] = useState(() => (window.innerWidth < 760 ? 2 : 4));
  const [vista, setVista] = useState<'linea' | 'agenda'>(() => (window.innerWidth < 760 ? 'agenda' : 'linea'));
  const [datos, setDatos] = useState<DatosTimeline | null>(null);
  const [todos, setTodos] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fin = sumar(inicio, semanas * 7 - 1);

  useEffect(() => {
    setError(null);
    const q = new URLSearchParams({ desde: inicio, hasta: fin, ...(proyecto ? { proyecto } : {}) });
    api<DatosTimeline>(`/timeline?${q}`)
      .then((d) => {
        setDatos(d);
        if (!proyecto) setTodos(d.proyectos);
      })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
  }, [inicio, fin, proyecto]);
  // La lista de proyectos para elegir, aunque se esté viendo uno solo.
  useEffect(() => {
    if (!proyecto || todos.length) return;
    api<DatosTimeline>(`/timeline?desde=${hoy()}&hasta=${hoy()}`).then((d) => setTodos(d.proyectos)).catch(() => {});
  }, [proyecto, todos.length]);

  const dias = useMemo(() => Array.from({ length: semanas * 7 }, (_, i) => sumar(inicio, i)), [inicio, semanas]);
  const abrir = (t: TareaTimeline) => navegar(`/proyectos/${t.projectId}/tareas?tarea=${t.id}`);
  const nombre = new Map((datos?.proyectos ?? todos).map((p) => [p.id, p.name]));

  return (
    <>
      <div className="herramientas timeline-herramientas">
        <div className="empuja">
          <h2 style={{ fontSize: 20 }}>Timeline</h2>
          <p className="meta" style={{ margin: '2px 0 0' }}>{fechaCorta(inicio)} – {fechaCorta(fin)}</p>
        </div>
        <select aria-label="Proyecto" value={proyecto} onChange={(e) => setParams(e.target.value ? { proyecto: e.target.value } : {})}>
          <option value="">Todos los proyectos</option>
          {todos.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="segmentos" role="group" aria-label="Navegar">
          <button type="button" className="btn btn-sec btn-chico" aria-label="Antes" onClick={() => setInicio(sumar(inicio, -7))}><Icono nombre="atras" tam={14} /></button>
          <button type="button" className="btn btn-sec btn-chico" onClick={() => setInicio(lunesDe(hoy()))}>Hoy</button>
          <button type="button" className="btn btn-sec btn-chico" aria-label="Después" onClick={() => setInicio(sumar(inicio, 7))}><span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}><Icono nombre="atras" tam={14} /></span></button>
        </div>
        <div className="segmentos" role="group" aria-label="Vista">
          <button type="button" className={`btn btn-chico ${vista === 'linea' ? '' : 'btn-sec'}`} onClick={() => setVista('linea')}>Línea</button>
          <button type="button" className={`btn btn-chico ${vista === 'agenda' ? '' : 'btn-sec'}`} onClick={() => setVista('agenda')}>Agenda</button>
        </div>
        <select aria-label="Semanas" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
          <option value={1}>1 semana</option>
          <option value={2}>2 semanas</option>
          <option value={4}>4 semanas</option>
          <option value={8}>8 semanas</option>
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!datos ? (
        !error && <p className="cargando">Cargando…</p>
      ) : datos.tareas.length === 0 ? (
        <div className="card vacio">
          <Icono nombre="calendario" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>Nada con fecha en estas semanas</p>
          <p className="meta" style={{ margin: 0 }}>Las tareas aparecen aquí cuando tienen fecha de entrega (y, si quieres una barra, fecha de inicio).</p>
        </div>
      ) : vista === 'linea' ? (
        <Linea datos={datos} dias={dias} nombre={nombre} abrir={abrir} unProyecto={!!proyecto} />
      ) : (
        <Agenda datos={datos} dias={dias} nombre={nombre} abrir={abrir} unProyecto={!!proyecto} />
      )}
      {datos?.recortado && <p className="ayuda">Hay muchas tareas en este rango: se muestran las primeras. Elige un proyecto o menos semanas.</p>}
      <p className="ayuda">
        <span className="punto-estado normal" /> pendiente · <span className="punto-estado revision" /> en revisión · <span className="punto-estado vencida" /> vencida · <span className="punto-estado hecha" /> hecha
        {proyecto && <> · <Link to={`/proyectos/${proyecto}/tareas`}>Ir a las tareas</Link></>}
      </p>
    </>
  );
}

type Props = { datos: DatosTimeline; dias: string[]; nombre: Map<string, string>; abrir: (t: TareaTimeline) => void; unProyecto: boolean };

/** Una fila por tarea, agrupadas por proyecto; la barra va de "desde" a "hasta". */
function Linea({ datos, dias, nombre, abrir, unProyecto }: Props) {
  const inicio = dias[0];
  const fin = dias.at(-1)!;
  const grupos = new Map<string, TareaTimeline[]>();
  for (const t of datos.tareas) grupos.set(t.projectId, [...(grupos.get(t.projectId) ?? []), t]);
  const columnas = `minmax(150px, 220px) repeat(${dias.length}, minmax(${dias.length > 28 ? 18 : 30}px, 1fr))`;
  const h = hoy();
  return (
    <div className="timeline" style={{ gridTemplateColumns: columnas }}>
      <div className="tl-esquina" />
      {dias.map((d) => {
        const dow = new Date(`${d}T12:00:00`).getDay();
        return (
          <div key={d} className={`tl-dia${dow === 0 || dow === 6 ? ' finde' : ''}${d === h ? ' hoy' : ''}`} title={fechaLarga(d)}>
            <span>{LETRA[dow]}</span>
            <b>{Number(d.slice(8))}</b>
          </div>
        );
      })}
      {[...grupos.entries()].map(([pid, tareas]) => (
        <div key={pid} className="tl-grupo" style={{ display: 'contents' }}>
          {!unProyecto && <div className="tl-proyecto" style={{ gridColumn: '1 / -1' }}>{nombre.get(pid) ?? 'Proyecto'}</div>}
          {tareas.map((t) => {
            const a = Math.max(0, entre(inicio, t.desde < inicio ? inicio : t.desde));
            const b = Math.min(dias.length - 1, entre(inicio, t.hasta > fin ? fin : t.hasta));
            const punto = t.desde === t.hasta;
            return (
              <div key={t.id} style={{ display: 'contents' }}>
                <button type="button" className="tl-nombre" onClick={() => abrir(t)} title={t.title}>
                  <span>{t.title}</span>
                  <span className="meta">{t.hora ? `${textoHora(t.hora, t.horaFin)} · ` : ''}{t.responsables.map((r) => r.name.split(' ')[0]).join(', ') || t.lista}</span>
                </button>
                <div className="tl-carril" style={{ gridColumn: `2 / span ${dias.length}` }}>
                  <button
                    type="button"
                    className={`tl-barra ${estado(t)}${punto ? ' punto' : ''}${t.desde < inicio ? ' corta-ini' : ''}${t.hasta > fin ? ' corta-fin' : ''}`}
                    style={{ left: `${(a / dias.length) * 100}%`, width: `${((b - a + 1) / dias.length) * 100}%` }}
                    onClick={() => abrir(t)}
                    title={`${t.title} · ${punto ? fechaCorta(t.hasta) : `${fechaCorta(t.desde)} – ${fechaCorta(t.hasta)}`}${t.hora ? ` · ${textoHora(t.hora, t.horaFin)}` : ''}${t.lugar ? ` · ${t.lugar}` : ''}${t.columna ? ` · ${t.columna.nombre}` : ''}`}
                  >
                    {!punto && <span>{t.title}</span>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Día por día: lo que vence (o se hace) cada día; lo de varios días, el día que termina. */
function Agenda({ datos, dias, nombre, abrir, unProyecto }: Props) {
  const h = hoy();
  const porDia = new Map<string, TareaTimeline[]>();
  const [primero, ultimo] = [dias[0], dias.at(-1)!];
  // El día de entrega si cae en el rango; si no, el día en que empieza; si abarca todo, el primero.
  const diaDe = (t: TareaTimeline) => (t.hasta >= primero && t.hasta <= ultimo ? t.hasta : t.desde >= primero && t.desde <= ultimo ? t.desde : primero);
  for (const t of datos.tareas) {
    const dia = diaDe(t);
    porDia.set(dia, [...(porDia.get(dia) ?? []), t]);
  }
  return (
    <div className="agenda">
      {dias.filter((d) => porDia.has(d) || d === h).map((d) => (
        <section key={d} className={`agenda-dia${d === h ? ' hoy' : ''}`}>
          <h3>{d === h ? `Hoy, ${fechaLarga(d)}` : fechaLarga(d)}</h3>
          {(porDia.get(d) ?? []).length === 0 && <p className="meta" style={{ margin: 0 }}>Nada para hoy.</p>}
          <ul>
            {(porDia.get(d) ?? []).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => abrir(t)}>
                  <span className={`punto-estado ${estado(t)}`} />
                  <span className="agenda-titulo">{t.hora && <span className="agenda-hora">{textoHora(t.hora, t.horaFin)}</span>}{t.title}</span>
                  <span className="meta">
                    {!unProyecto && `${nombre.get(t.projectId) ?? ''} · `}
                    {t.desde !== t.hasta && (diaDe(t) === t.hasta ? `desde ${fechaCorta(t.desde)} · ` : `hasta ${fechaCorta(t.hasta)} · `)}
                    {t.columna ? `${t.columna.nombre} · ` : ''}
                    {t.responsables.map((r) => r.name.split(' ')[0]).join(', ') || 'sin responsable'}
                  </span>
                </button>
                {t.lugar && (
                  <a className="agenda-lugar" href={enlaceLugar(t.lugar)} target="_blank" rel="noopener noreferrer">
                    <Icono nombre="lugar" tam={12} />{t.lugar}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
