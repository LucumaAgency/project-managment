import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ErrorApi, NOMBRE_AUDIENCIA, type Audiencia, type PlantillaDetalle, type TareaPlantilla } from '../api';
import Icono from '../componentes/Icono';

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
const AYUDA_AUDIENCIA: Record<Audiencia, string> = {
  team: 'Interna: la hace el equipo y el cliente no la ve.',
  client: 'Se le asigna al cliente y la ve.',
  any: 'Del equipo, pero el cliente la ve y también puede completarla.',
};
const vacia = (): TareaPlantilla => ({ title: '', notes: null, audience: 'team', dayOffset: null });

/** Ver o editar una plantilla: nombre, descripción y sus tareas en orden. */
export default function Plantilla() {
  const { id } = useParams<{ id: string }>();
  const nueva = id === 'nueva';
  const navegar = useNavigate();
  const [cargada, setCargada] = useState(nueva);
  const [gestionar, setGestionar] = useState(nueva);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [items, setItems] = useState<TareaPlantilla[]>(nueva ? [vacia()] : []);
  const [conNotas, setConNotas] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (nueva) return;
    api<PlantillaDetalle>(`/plantillas/${id}`)
      .then((r) => {
        setNombre(r.plantilla.name);
        setDescripcion(r.plantilla.description ?? '');
        setItems(r.plantilla.items);
        setConNotas(new Set(r.plantilla.items.flatMap((i, n) => (i.notes ? [n] : []))));
        setGestionar(r.permisos.gestionar);
        setCargada(true);
      })
      .catch((e) => setError(mensajeDe(e)));
  }, [id, nueva]);

  const cambiar = (n: number, c: Partial<TareaPlantilla>) => {
    setGuardado(false);
    setItems((xs) => xs.map((x, i) => (i === n ? { ...x, ...c } : x)));
  };
  const mover = (n: number, d: -1 | 1) => {
    setGuardado(false);
    setItems((xs) => {
      const ys = [...xs];
      [ys[n], ys[n + d]] = [ys[n + d], ys[n]];
      return ys;
    });
    setConNotas((s) => new Set([...s].map((i) => (i === n ? n + d : i === n + d ? n : i))));
  };
  const quitar = (n: number) => {
    setGuardado(false);
    setItems((xs) => xs.filter((_, i) => i !== n));
    setConNotas((s) => new Set([...s].filter((i) => i !== n).map((i) => (i > n ? i - 1 : i))));
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const cuerpo = {
      name: nombre,
      description: descripcion || null,
      items: items.filter((i) => i.title.trim()).map(({ id: _, ...i }) => ({ ...i, notes: i.notes?.trim() || null })),
    };
    try {
      const r = await api<PlantillaDetalle>(nueva ? '/plantillas' : `/plantillas/${id}`, { method: nueva ? 'POST' : 'PUT', body: cuerpo });
      if (nueva) navegar(`/plantillas/${r.plantilla.id}`, { replace: true });
      else setGuardado(true);
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la plantilla «${nombre}»? Las listas que ya se crearon con ella no cambian.`)) return;
    try {
      await api(`/plantillas/${id}`, { method: 'DELETE' });
      navegar('/plantillas');
    } catch (err) {
      setError(mensajeDe(err));
    }
  }

  if (!cargada) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;

  const volver = (
    <p className="meta" style={{ margin: '0 0 8px' }}>
      <Link to="/plantillas"><Icono nombre="atras" tam={14} /> Plantillas</Link>
    </p>
  );

  if (!gestionar) {
    return (
      <>
        {volver}
        <h2 style={{ fontSize: 20 }}>{nombre}</h2>
        {descripcion && <p className="meta">{descripcion}</p>}
        <section className="card">
          <ul className="tareas">
            {items.map((i, n) => (
              <li key={n} className="tarea plantilla-fila-lectura">
                <span className="tarea-titulo">{i.title}</span>
                <span className="tarea-meta">
                  <span className={`chip ${i.audience === 'team' ? 'chip-gris' : 'chip-verde'}`}>{NOMBRE_AUDIENCIA[i.audience]}</span>
                  {i.dayOffset && <span>Día {i.dayOffset}</span>}
                  {i.notes && <Icono nombre="notas" tam={13} />}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <p className="ayuda">Para usarla: en las Tareas de un proyecto, «Desde plantilla». Solo un administrador la edita.</p>
      </>
    );
  }

  return (
    <form onSubmit={guardar}>
      {volver}
      <section className="card">
        <label htmlFor="pl-nombre">Nombre</label>
        <input id="pl-nombre" required autoFocus={nueva} maxLength={200} placeholder="Ej.: Onboarding de cliente" value={nombre} onChange={(e) => { setNombre(e.target.value); setGuardado(false); }} />
        <label htmlFor="pl-desc">Descripción (opcional, va en la lista)</label>
        <textarea id="pl-desc" rows={2} maxLength={2000} placeholder="Para qué sirve, cuándo se usa" value={descripcion} onChange={(e) => { setDescripcion(e.target.value); setGuardado(false); }} />
      </section>

      <section className="card">
        <h3 className="titulo-lista">Tareas</h3>
        <p className="ayuda" style={{ marginTop: 0 }}>
          «Día» cuenta desde la fecha de inicio que eliges al agregarla (día 1 = ese mismo día). Vacío = sin fecha.
        </p>
        <ol className="plantilla-filas">
          {items.map((i, n) => (
            <li key={n} className="plantilla-fila">
              <div className="plantilla-fila-arriba">
                <input aria-label={`Tarea ${n + 1}`} maxLength={300} placeholder="Ej.: Datos de la empresa (razón social, RUC)" value={i.title} onChange={(e) => cambiar(n, { title: e.target.value })} />
                <select aria-label={`Para quién es la tarea ${n + 1}`} value={i.audience} title={AYUDA_AUDIENCIA[i.audience]} onChange={(e) => cambiar(n, { audience: e.target.value as Audiencia })}>
                  {(Object.keys(NOMBRE_AUDIENCIA) as Audiencia[]).map((a) => (
                    <option key={a} value={a}>{NOMBRE_AUDIENCIA[a]}</option>
                  ))}
                </select>
                <input
                  aria-label={`Día de la tarea ${n + 1}`}
                  className="plantilla-dia"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="Día"
                  value={i.dayOffset ?? ''}
                  onChange={(e) => cambiar(n, { dayOffset: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              {conNotas.has(n) && (
                <textarea aria-label={`Notas de la tarea ${n + 1}`} rows={2} maxLength={5000} placeholder="Qué se pide, enlaces, detalles" value={i.notes ?? ''} onChange={(e) => cambiar(n, { notes: e.target.value })} />
              )}
              <div className="plantilla-fila-acciones">
                <span className="ayuda" style={{ margin: 0, flex: 1 }}>{AYUDA_AUDIENCIA[i.audience]}</span>
                {!conNotas.has(n) && (
                  <button type="button" className="btn-texto" onClick={() => setConNotas((s) => new Set(s).add(n))}>+ notas</button>
                )}
                <button type="button" className="btn btn-sec btn-chico" aria-label="Subir" disabled={n === 0} onClick={() => mover(n, -1)}><Icono nombre="subirFlecha" tam={14} /></button>
                <button type="button" className="btn btn-sec btn-chico" aria-label="Bajar" disabled={n === items.length - 1} onClick={() => mover(n, 1)}><Icono nombre="bajarFlecha" tam={14} /></button>
                <button type="button" className="btn btn-sec btn-chico" aria-label="Quitar" onClick={() => quitar(n)}><Icono nombre="papelera" tam={14} /></button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-sec" onClick={() => { setItems((xs) => [...xs, vacia()]); setGuardado(false); }}>
          <Icono nombre="mas" tam={16} />Agregar tarea
        </button>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        {!nueva && <button type="button" className="btn-texto peligro" onClick={borrar}>Borrar plantilla</button>}
        <span style={{ flex: 1 }} />
        {guardado && <span className="meta">Guardada ✓</span>}
        <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : nueva ? 'Crear plantilla' : 'Guardar'}</button>
      </div>
    </form>
  );
}
