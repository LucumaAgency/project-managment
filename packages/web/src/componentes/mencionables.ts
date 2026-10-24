import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PersonaMencionable } from './Editor';

interface Persona extends PersonaMencionable {
  role: string;
}

/** Una carga por proyecto y por minuto (la lista cambia poco; quien se suma aparece al rato). */
const VIGENCIA_MS = 60_000;
const cache = new Map<string, { cuando: number; personas: Promise<Persona[]> }>();

/**
 * Quiénes se pueden mencionar o asignar. Se pide la lista completa una vez y se filtra aquí:
 * si lo que se escribe es interno, sin clientes. Así, marcar "visible para el cliente" cambia
 * la lista al instante (antes se volvía a pedir y quien escribía rápido no veía al cliente).
 * El servidor igual descarta lo que no corresponde (D-48).
 */
export function useMencionables(projectId: string | undefined, interno: boolean, sinMi?: string) {
  const [todas, setTodas] = useState<Persona[]>([]);
  useEffect(() => {
    if (!projectId) return;
    let entrada = cache.get(projectId);
    if (!entrada || Date.now() - entrada.cuando > VIGENCIA_MS) {
      const personas = api<{ personas: Persona[] }>(`/proyectos/${projectId}/mencionables`).then((r) => r.personas);
      personas.catch(() => cache.delete(projectId));
      entrada = { cuando: Date.now(), personas };
      cache.set(projectId, entrada);
    }
    const p = entrada.personas;
    let vivo = true;
    p.then((r) => vivo && setTodas(r)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId]);
  return todas.filter((x) => (!interno || x.role !== 'client') && x.userId !== sinMi);
}

/** Tras sumar o quitar personas del proyecto, la lista se vuelve a pedir. */
export const olvidarMencionables = (projectId: string) => cache.delete(projectId);
