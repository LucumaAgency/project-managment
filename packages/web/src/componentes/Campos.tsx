import { useEffect, useRef, useState } from 'react';
import {
  api,
  ErrorApi,
  NOMBRE_TIPO_CAMPO,
  subirBinario,
  tamano,
  urlArchivo,
  type AccesoProtegido,
  type ArchivoRespuesta,
  type Campo,
  type DatosAcceso,
  type VistaAcceso,
  type CampoConRespuesta,
  type EnlaceRespuesta,
  type RespuestaGuardada,
  type TipoCampo,
} from '../api';
import Icono from './Icono';

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const EJEMPLO: Record<TipoCampo, string> = { texto: 'Ej.: RUC', parrafo: 'Ej.: Cuéntanos de tu negocio', archivo: 'Ej.: Manual de marca (PDF)', enlaces: 'Ej.: Webs que te gustan', acceso: 'Ej.: Acceso al hosting' };

/**
 * Qué pide una tarea (o una tarea de plantilla): una lista de campos con nombre, tipo y si es
 * obligatorio. Los campos que ya existían viajan con su id, así no se pierden sus respuestas.
 */
export function EditorCampos({
  campos,
  onChange,
  prefijo = 'campo',
  conCarpeta = false,
}: {
  campos: Campo[];
  onChange: (c: Campo[]) => void;
  prefijo?: string;
  /** La plantilla crea una carpeta: los campos de archivos pueden guardar también ahí (D-73). */
  conCarpeta?: boolean;
}) {
  const cambiar = (n: number, c: Partial<Campo>) => onChange(campos.map((x, i) => (i === n ? { ...x, ...c } : x)));
  const mover = (n: number, d: -1 | 1) => {
    const ys = [...campos];
    [ys[n], ys[n + d]] = [ys[n + d], ys[n]];
    onChange(ys);
  };
  return (
    <div className="editor-campos">
      {campos.map((c, n) => (
        <div key={c.id ?? `n${n}`} className="editor-campo">
          <input aria-label={`Nombre del campo ${n + 1}`} id={`${prefijo}-${n}`} maxLength={120} placeholder={EJEMPLO[c.tipo]} value={c.etiqueta} onChange={(e) => cambiar(n, { etiqueta: e.target.value })} />
          <select aria-label={`Tipo del campo ${n + 1}`} value={c.tipo} onChange={(e) => cambiar(n, { tipo: e.target.value as TipoCampo })}>
            {(Object.keys(NOMBRE_TIPO_CAMPO) as TipoCampo[]).map((t) => (
              <option key={t} value={t}>{NOMBRE_TIPO_CAMPO[t]}</option>
            ))}
          </select>
          <label className="casilla">
            <input type="checkbox" checked={c.obligatorio} onChange={(e) => cambiar(n, { obligatorio: e.target.checked })} /> Obligatorio
          </label>
          {conCarpeta && c.tipo === 'archivo' && (
            <label className="casilla" title="Lo que se suba aquí también queda en la carpeta que crea la plantilla">
              <input type="checkbox" checked={!!c.aCarpeta} onChange={(e) => cambiar(n, { aCarpeta: e.target.checked })} /> También en la carpeta
            </label>
          )}
          <span className="editor-campo-botones">
            <button type="button" className="btn btn-sec btn-chico" aria-label="Subir campo" disabled={n === 0} onClick={() => mover(n, -1)}><Icono nombre="subirFlecha" tam={14} /></button>
            <button type="button" className="btn btn-sec btn-chico" aria-label="Bajar campo" disabled={n === campos.length - 1} onClick={() => mover(n, 1)}><Icono nombre="bajarFlecha" tam={14} /></button>
            <button type="button" className="btn btn-sec btn-chico" aria-label="Quitar campo" onClick={() => onChange(campos.filter((_, i) => i !== n))}><Icono nombre="papelera" tam={14} /></button>
          </span>
        </div>
      ))}
      <button type="button" className="btn-texto" onClick={() => onChange([...campos, { etiqueta: '', tipo: 'texto', obligatorio: true }])}>
        + Agregar campo
      </button>
    </div>
  );
}

/**
 * Acceso protegido (D-66): se ve solo el proveedor. El equipo lo abre con un clic, el servidor
 * lo deja registrado, y se oculta solo al minuto.
 */
function AccesoGuardado({ valor, tareaId, campoId, puedeVer }: { valor: AccesoProtegido; tareaId?: string; campoId: string; puedeVer: boolean }) {
  const [abierto, setAbierto] = useState<DatosAcceso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => setAbierto(null), 60_000);
    return () => clearTimeout(t);
  }, [abierto]);
  async function ver() {
    setError(null);
    try {
      setAbierto((await api<{ acceso: DatosAcceso }>(`/tareas/${tareaId}/campos/${campoId}/ver`, { body: {} })).acceso);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }
  const copiar = async (que: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      /* sin portapapeles: se puede seleccionar a mano */
    }
  };
  return (
    <div className="acceso-guardado">
      <span className="con-icono"><Icono nombre="candado" tam={14} />Acceso guardado{valor.proveedor ? ` · ${valor.proveedor}` : ''}</span>
      {puedeVer && tareaId && !abierto && (
        <button type="button" className="btn-texto" onClick={ver}>Ver acceso</button>
      )}
      {abierto && (
        <dl className="acceso-datos">
          {(['url', 'usuario', 'clave', 'notas'] as const).map((k) =>
            abierto[k] ? (
              <div key={k}>
                <dt>{{ url: 'Dónde se entra', usuario: 'Usuario', clave: 'Contraseña', notas: 'Notas' }[k]}</dt>
                <dd>
                  <code>{abierto[k]}</code>
                  {k !== 'notas' && (
                    <button type="button" className="btn-texto" onClick={() => copiar(k, abierto[k]!)}>{copiado === k ? 'Copiado' : 'Copiar'}</button>
                  )}
                </dd>
              </div>
            ) : null
          )}
          <button type="button" className="btn-texto" onClick={() => setAbierto(null)}>Ocultar</button>
        </dl>
      )}
      {!puedeVer && <span className="ayuda" style={{ margin: 0 }}>Solo lo ve el equipo de la agencia.</span>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Lo que respondieron en un campo, para leer (ficha, o quien no puede responder). */
export function ValorCampo({ campo, tareaId, puedeVer = false }: { campo: CampoConRespuesta; tareaId?: string; puedeVer?: boolean }) {
  const r = campo.respuesta;
  if (!r) return <span className="meta">Sin responder</span>;
  const v = r.valor;
  if (campo.tipo === 'acceso') return <AccesoGuardado valor={v as AccesoProtegido} tareaId={tareaId} campoId={campo.id} puedeVer={puedeVer} />;
  if (typeof v === 'string') return <span className="valor-texto">{v}</span>;
  if (campo.tipo === 'enlaces') {
    return (
      <ul className="valor-lista">
        {(v as EnlaceRespuesta[]).map((e, i) => (
          <li key={i}><a href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>{e.nota && <span className="meta"> · {e.nota}</span>}</li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="valor-lista">
      {(v as ArchivoRespuesta[]).map((a) => (
        <li key={a.blobId}><a href={urlArchivo(a.blobId)} target="_blank" rel="noopener">{a.nombre}</a> <span className="meta">{tamano(a.bytes)}</span></li>
      ))}
    </ul>
  );
}

const quien = (c: CampoConRespuesta) => c.respuesta && <span className="ayuda" style={{ margin: 0 }}>{c.respuesta.respondidoPor.name} · {fechaHora(c.respuesta.respondidoEl)}</span>;

/**
 * Responder lo que pide una tarea, ahí mismo. Texto y enlaces se guardan con un botón; los
 * archivos se suben al elegirlos. Cuando está todo lo obligatorio, la tarea se completa sola.
 */
export function Formulario({
  tareaId,
  campos,
  puedeResponder,
  esEquipo,
  vistas = [],
  onGuardado,
}: {
  tareaId: string;
  campos: CampoConRespuesta[];
  puedeResponder: boolean;
  esEquipo: boolean;
  vistas?: VistaAcceso[];
  onGuardado: (r: RespuestaGuardada) => void;
}) {
  const inicial = () =>
    Object.fromEntries(
      campos
        .filter((c) => c.tipo !== 'archivo')
        .map((c) => [
          c.id,
          c.tipo === 'enlaces'
            ? ((c.respuesta?.valor as EnlaceRespuesta[]) ?? []).concat([{ url: '' }])
            : c.tipo === 'acceso'
              ? ({ proveedor: (c.respuesta?.valor as AccesoProtegido | undefined)?.proveedor ?? '' } as DatosAcceso)
              : ((c.respuesta?.valor as string) ?? ''),
        ])
    ) as Record<string, string | EnlaceRespuesta[] | DatosAcceso>;
  const [borrador, setBorrador] = useState(inicial);
  const [verClave, setVerClave] = useState(false);
  // Un acceso ya guardado se muestra cerrado; "Cambiar" abre los campos para reemplazarlo.
  const [cambiando, setCambiando] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState<{ campo: string; avance: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const archivoRef = useRef<Record<string, HTMLInputElement | null>>({});
  // Si la tarea cambió afuera (otra respuesta, otro campo), se vuelve a partir de lo guardado.
  const firma = JSON.stringify(campos.map((c) => [c.id, c.respuesta?.respondidoEl]));
  useEffect(() => {
    setBorrador(inicial());
    setCambiando(new Set());
  }, [firma]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendientes = campos.filter((c) => c.obligatorio && !c.respuesta).length;
  const limpio = (c: CampoConRespuesta) => {
    const b = borrador[c.id];
    if (c.tipo === 'acceso') return b;
    return c.tipo === 'enlaces' ? (b as EnlaceRespuesta[]).filter((e) => e.url.trim()) : (b as string).trim();
  };
  const guardadoDe = (c: CampoConRespuesta) => (c.tipo === 'enlaces' ? ((c.respuesta?.valor as EnlaceRespuesta[]) ?? []) : ((c.respuesta?.valor as string) ?? ''));
  // Un acceso cuenta como cambio si se escribió algo además del proveedor.
  const accesoEscrito = (c: CampoConRespuesta) => {
    const a = borrador[c.id] as DatosAcceso;
    return !!(a.url?.trim() || a.usuario?.trim() || a.clave || a.notas?.trim());
  };
  const cambiados = campos.filter((c) =>
    c.tipo === 'archivo' ? false : c.tipo === 'acceso' ? accesoEscrito(c) : JSON.stringify(limpio(c)) !== JSON.stringify(guardadoDe(c))
  );
  const escribirAcceso = (id: string, k: keyof DatosAcceso, v: string) => setBorrador((b) => ({ ...b, [id]: { ...(b[id] as DatosAcceso), [k]: v } }));

  const terminar = (r: RespuestaGuardada) => {
    setAviso(r.seCompleto ? 'Listo: con esto la tarea quedó completa.' : 'Guardado.');
    onGuardado(r);
  };

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const respuestas = Object.fromEntries(cambiados.map((c) => [c.id, limpio(c)]));
      terminar(await api<RespuestaGuardada>(`/tareas/${tareaId}/respuestas`, { method: 'PUT', body: { respuestas } }));
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  }

  async function subir(c: CampoConRespuesta, archivos: FileList | null) {
    if (!archivos?.length) return;
    setError(null);
    setAviso(null);
    try {
      let ultimo: RespuestaGuardada | null = null;
      for (const f of Array.from(archivos)) {
        setSubiendo({ campo: c.id, avance: 0 });
        ultimo = await subirBinario<RespuestaGuardada>(`/tareas/${tareaId}/campos/${c.id}/archivos?nombre=${encodeURIComponent(f.name)}`, f, (avance) => setSubiendo({ campo: c.id, avance }));
      }
      if (ultimo) terminar(ultimo);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setSubiendo(null);
      const input = archivoRef.current[c.id];
      if (input) input.value = '';
    }
  }

  async function quitarArchivo(c: CampoConRespuesta, blobId: string) {
    if (!window.confirm('¿Quitar este archivo?')) return;
    const quedan = ((c.respuesta?.valor as ArchivoRespuesta[]) ?? []).filter((a) => a.blobId !== blobId).map((a) => ({ blobId: a.blobId }));
    try {
      terminar(await api<RespuestaGuardada>(`/tareas/${tareaId}/respuestas`, { method: 'PUT', body: { respuestas: { [c.id]: quedan } } }));
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  return (
    <section className="formulario-tarea" aria-label="Lo que pide esta tarea">
      <div className="fila" style={{ alignItems: 'baseline' }}>
        <h3 className="titulo-panel" style={{ margin: 0 }}>Lo que se pide</h3>
        <span className={`chip ${pendientes ? 'chip-alerta' : 'chip-verde'}`}>{pendientes ? `Faltan ${pendientes}` : 'Todo respondido'}</span>
      </div>
      {campos.map((c) => (
        <div key={c.id} className="campo-respuesta">
          <label htmlFor={`r-${c.id}`}>
            {c.etiqueta}
            {!c.obligatorio && <span className="meta"> (opcional)</span>}
          </label>
          {c.ayuda && <p className="ayuda" style={{ marginTop: 0 }}>{c.ayuda}</p>}
          {!puedeResponder ? (
            <ValorCampo campo={c} tareaId={tareaId} puedeVer={esEquipo} />
          ) : c.tipo === 'acceso' ? (
            <div className="acceso-respuesta">
              {c.respuesta && <ValorCampo campo={c} tareaId={tareaId} puedeVer={esEquipo} />}
              {c.respuesta && !cambiando.has(c.id) ? (
                <button type="button" className="btn-texto" onClick={() => setCambiando((x) => new Set(x).add(c.id))}>Cambiar este acceso</button>
              ) : (
              <>
              <p className="ayuda" style={{ margin: '4px 0' }}>
                {c.respuesta ? 'El nuevo reemplaza al anterior.' : 'Se guarda cifrado y solo lo ve el equipo de la agencia.'}
              </p>
              <div className="acceso-campos">
                <input id={`r-${c.id}`} aria-label={`Proveedor de ${c.etiqueta}`} placeholder="Proveedor (ej.: Hostinger, Punto.pe)" maxLength={120} value={(borrador[c.id] as DatosAcceso).proveedor ?? ''} onChange={(e) => escribirAcceso(c.id, 'proveedor', e.target.value)} />
                <input aria-label={`Dónde se entra a ${c.etiqueta}`} placeholder="Dónde se entra (enlace)" inputMode="url" maxLength={500} value={(borrador[c.id] as DatosAcceso).url ?? ''} onChange={(e) => escribirAcceso(c.id, 'url', e.target.value)} />
                <input aria-label={`Usuario de ${c.etiqueta}`} placeholder="Usuario o correo" autoComplete="off" maxLength={200} value={(borrador[c.id] as DatosAcceso).usuario ?? ''} onChange={(e) => escribirAcceso(c.id, 'usuario', e.target.value)} />
                <div className="sumar">
                  <input aria-label={`Contraseña de ${c.etiqueta}`} placeholder="Contraseña" type={verClave ? 'text' : 'password'} autoComplete="new-password" maxLength={500} value={(borrador[c.id] as DatosAcceso).clave ?? ''} onChange={(e) => escribirAcceso(c.id, 'clave', e.target.value)} />
                  <button type="button" className="btn btn-sec" onClick={() => setVerClave((v) => !v)}>{verClave ? 'Ocultar' : 'Mostrar'}</button>
                </div>
                <textarea aria-label={`Notas de ${c.etiqueta}`} placeholder="Notas (ej.: el código llega al celular de Rosa)" rows={2} maxLength={1000} value={(borrador[c.id] as DatosAcceso).notas ?? ''} onChange={(e) => escribirAcceso(c.id, 'notas', e.target.value)} />
              </div>
              </>
              )}
              {esEquipo && vistas.some((x) => x.campoId === c.id) && (
                <p className="ayuda" style={{ margin: '4px 0 0' }}>
                  Lo vieron: {vistas.filter((x) => x.campoId === c.id).slice(0, 3).map((x) => `${x.nombre} (${fechaHora(x.el)})`).join(', ')}
                </p>
              )}
            </div>
          ) : c.tipo === 'texto' ? (
            <input id={`r-${c.id}`} maxLength={500} value={borrador[c.id] as string} onChange={(e) => setBorrador((b) => ({ ...b, [c.id]: e.target.value }))} />
          ) : c.tipo === 'parrafo' ? (
            <textarea id={`r-${c.id}`} rows={3} maxLength={5000} value={borrador[c.id] as string} onChange={(e) => setBorrador((b) => ({ ...b, [c.id]: e.target.value }))} />
          ) : c.tipo === 'enlaces' ? (
            <div className="enlaces-respuesta">
              {(borrador[c.id] as EnlaceRespuesta[]).map((e, i, todos) => (
                <div key={i} className="enlace-fila">
                  <input
                    id={i === 0 ? `r-${c.id}` : undefined}
                    aria-label={`Enlace ${i + 1} de ${c.etiqueta}`}
                    inputMode="url"
                    placeholder="https://…"
                    maxLength={2000}
                    value={e.url}
                    onChange={(ev) => {
                      const nuevos = todos.map((x, j) => (j === i ? { ...x, url: ev.target.value } : x));
                      // Siempre queda una fila vacía para el siguiente.
                      if (i === todos.length - 1 && ev.target.value) nuevos.push({ url: '' });
                      setBorrador((b) => ({ ...b, [c.id]: nuevos }));
                    }}
                  />
                  <input
                    aria-label={`Comentario del enlace ${i + 1}`}
                    placeholder="Qué te gusta (opcional)"
                    maxLength={300}
                    value={e.nota ?? ''}
                    onChange={(ev) => setBorrador((b) => ({ ...b, [c.id]: todos.map((x, j) => (j === i ? { ...x, nota: ev.target.value } : x)) }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="archivos-respuesta">
              <ul className="valor-lista">
                {((c.respuesta?.valor as ArchivoRespuesta[]) ?? []).map((a) => (
                  <li key={a.blobId}>
                    <a href={urlArchivo(a.blobId)} target="_blank" rel="noopener">{a.nombre}</a> <span className="meta">{tamano(a.bytes)}</span>
                    <button type="button" className="btn-texto peligro" aria-label={`Quitar ${a.nombre}`} onClick={() => quitarArchivo(c, a.blobId)}>Quitar</button>
                  </li>
                ))}
              </ul>
              {c.carpetaId && <p className="ayuda" style={{ margin: '4px 0' }}>Lo que subas aquí también queda en Archivos, en la carpeta de esta lista.</p>}
              <input ref={(el) => { archivoRef.current[c.id] = el; }} id={`r-${c.id}`} type="file" multiple hidden onChange={(e) => subir(c, e.target.files)} />
              <button type="button" className="btn btn-sec" disabled={!!subiendo} onClick={() => archivoRef.current[c.id]?.click()}>
                <Icono nombre="subirArchivo" tam={16} />
                {subiendo?.campo === c.id ? `Subiendo… ${Math.round(subiendo.avance * 100)} %` : 'Subir archivo'}
              </button>
            </div>
          )}
          {quien(c)}
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && !error && <p className="aviso-ok" role="status">{aviso}</p>}
      {puedeResponder && campos.some((c) => c.tipo !== 'archivo') && (
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn" disabled={guardando || cambiados.length === 0} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar respuestas'}
          </button>
        </div>
      )}
    </section>
  );
}
