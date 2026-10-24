import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { api, ErrorApi, type ProyectoResumen } from '../api';
import Editor, { Contenido, type ControlEditor, type PersonaMencionable } from '../componentes/Editor';

/**
 * Solo en desarrollo (/_editor): prueba el editor de punta a punta. Guarda un mensaje de
 * prueba en el primer proyecto y muestra el HTML que armó el servidor. Desde el día 7 el
 * editor vive en tareas, mensajes y comentarios; esta página no llega a producción.
 */
export default function PruebaEditor() {
  const [proyecto, setProyecto] = useState<ProyectoResumen | null>(null);
  const [personas, setPersonas] = useState<PersonaMencionable[]>([]);
  const [doc, setDoc] = useState<JSONContent | null>(null);
  const [guardado, setGuardado] = useState<{ bodyHtml: string | null; bodyText: string | null; mencionados: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<ControlEditor>(null);

  useEffect(() => {
    api<{ proyectos: ProyectoResumen[] }>('/proyectos').then(async (r) => {
      const p = r.proyectos[0];
      if (!p) return setError('Crea un proyecto primero.');
      setProyecto(p);
      setPersonas((await api<{ personas: PersonaMencionable[] }>(`/proyectos/${p.id}/mencionables`)).personas);
    });
  }, []);

  async function guardar() {
    if (!proyecto || !doc) return;
    setError(null);
    try {
      const r = await api<{ elemento: { bodyHtml: string | null; bodyText: string | null; mencionados: string[] } }>(
        `/proyectos/${proyecto.id}/elementos`,
        { body: { type: 'message', title: 'Prueba del editor', body: doc, visibleToClients: true } }
      );
      setGuardado(r.elemento);
      editor.current?.limpiar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h2 className="titulo-panel">Prueba del editor</h2>
      <p className="meta">Proyecto: {proyecto?.name ?? '…'} · escribe @ para mencionar · Ctrl+Enter guarda</p>
      <Editor ref={editor} personas={personas} onChange={(d) => setDoc(d)} onEnviar={guardar} placeholder="Escribe un mensaje…" etiqueta="Mensaje" />
      <div className="acciones"><button type="button" className="btn" onClick={guardar}>Guardar mensaje de prueba</button></div>
      {error && <p className="error">{error}</p>}
      {guardado && (
        <>
          <h3 className="titulo-panel" style={{ marginTop: 16 }}>Lo que guardó el servidor</h3>
          <div className="card" id="resultado"><Contenido html={guardado.bodyHtml} /></div>
          <p className="meta" id="mencionados">Mencionados: {guardado.mencionados.length}</p>
          <pre className="codigo" style={{ whiteSpace: 'pre-wrap' }} id="texto-plano">{guardado.bodyText}</pre>
        </>
      )}
    </div>
  );
}
