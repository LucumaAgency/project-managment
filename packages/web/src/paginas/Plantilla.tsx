import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ErrorApi, NOMBRE_AUDIENCIA, type Audiencia, type PlantillaDetalle, type TareaPlantilla } from '../api';
import { EditorCampos } from '../componentes/Campos';
import Icono from '../componentes/Icono';

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
const AYUDA_AUDIENCIA: Record<Audiencia, string> = {
  team: 'Interna: la hace el equipo y el cliente no la ve.',
  client: 'Se le asigna al cliente y la ve.',
  any: 'Del equipo, pero el cliente la ve y también puede completarla.',
};
const vacia = (): TareaPlantilla => ({ title: '', notes: null, audience: 'team', dayOffset: null, campos: [] });

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
  /** Las esperas apuntan a posiciones (1 = la primera): al mover o quitar, se corrigen. */
  const corregirEsperas = (xs: TareaPlantilla[], mapa: (pos: number) => number | null) =>
    xs.map((x, i) => {
      const w = x.waitsFor ? mapa(x.waitsFor) : null;
      return { ...x, waitsFor: w && w < i + 1 ? w : null };
    });
  const mover = (n: number, d: -1 | 1) => {
    setGuardado(false);
    setItems((xs) => {
      const ys = [...xs];
      [ys[n], ys[n + d]] = [ys[n + d], ys[n]];
      const a = n + 1;
      const b = n + d + 1;
      return corregirEsperas(ys, (p) => (p === a ? b : p === b ? a : p));
    });
    setConNotas((s) => new Set([...s].map((i) => (i === n ? n + d : i === n + d ? n : i))));
  };
  const quitar = (n: number) => {
    setGuardado(false);
    setItems((xs) => corregirEsperas(xs.filter((_, i) => i !== n), (p) => (p === n + 1 ? null : p > n + 1 ? p - 1 : p)));
    setConNotas((s) => new Set([...s].filter((i) => i !== n).map((i) => (i > n ? i - 1 : i))));
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const cuerpo = {
      name: nombre,
      description: descripcion || null,
      // Se mandan todas (también las vacías): el servidor las descarta y renumera las esperas.
      items: items
        .map(({ id: _, ...i }) => ({ ...i, notes: i.notes?.trim() || null, campos: (i.campos ?? []).filter((c) => c.etiqueta.trim()) })),
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
                  {i.waitsFor && <span>Espera a la {i.waitsFor}</span>}
                  {i.dayOffset && <span>{i.waitsFor ? `Vence a los ${i.dayOffset} días` : `Día ${i.dayOffset}`}</span>}
                  {i.notes && <Icono nombre="notas" tam={13} />}
                  {!!i.campos?.length && <span>Pide: {i.campos.map((c) => c.etiqueta).join(', ')}</span>}
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
                  placeholder={i.waitsFor ? 'Días' : 'Día'}
                  title={i.waitsFor ? 'Días desde que se activa (1 = ese mismo día)' : 'Día desde el inicio (1 = el día de inicio)'}
                  value={i.dayOffset ?? ''}
                  onChange={(e) => cambiar(n, { dayOffset: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              {n > 0 && (
                <div className="plantilla-espera">
                  <label htmlFor={`pl-espera-${n}`}>Se activa cuando se complete</label>
                  <select id={`pl-espera-${n}`} value={i.waitsFor ?? ''} onChange={(e) => cambiar(n, { waitsFor: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">No espera: arranca con la lista</option>
                    {items.slice(0, n).map((x, k) => (
                      <option key={k} value={k + 1}>{k + 1}. {x.title || '(sin título)'}</option>
                    ))}
                  </select>
                  {i.waitsFor && <span className="ayuda" style={{ margin: 0 }}>Hasta entonces no tiene responsable ni fecha. «Día» cuenta desde que se activa.</span>}
                </div>
              )}
              {!!i.campos?.length && (
                <div className="plantilla-pide">
                  <span className="ayuda" style={{ margin: '8px 0 4px', display: 'block' }}>Al responder, pide:</span>
                  <EditorCampos campos={i.campos} onChange={(c) => cambiar(n, { campos: c })} prefijo={`pl-${n}-campo`} />
                </div>
              )}
              {conNotas.has(n) && (
                <textarea aria-label={`Notas de la tarea ${n + 1}`} rows={2} maxLength={5000} placeholder="Qué se pide, enlaces, detalles" value={i.notes ?? ''} onChange={(e) => cambiar(n, { notes: e.target.value })} />
              )}
              <div className="plantilla-fila-acciones">
                <span className="ayuda" style={{ margin: 0, flex: 1 }}>{AYUDA_AUDIENCIA[i.audience]}</span>
                {!conNotas.has(n) && (
                  <button type="button" className="btn-texto" onClick={() => setConNotas((s) => new Set(s).add(n))}>+ notas</button>
                )}
                {!i.campos?.length && (
                  <button type="button" className="btn-texto" onClick={() => cambiar(n, { campos: [{ etiqueta: '', tipo: 'texto', obligatorio: true }] })}>+ pedir datos</button>
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
