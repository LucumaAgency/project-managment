/**
 * Primeros pasos (D-76): qué le falta a la persona para empezar a usar la cuenta, igual que la
 * guía del CRM. Cada paso se da por hecho mirando los datos, no marcando una casilla. Los pasos
 * dependen del rol: quien administra arma proyecto, tareas, equipo y cliente; el equipo trabaja
 * tareas y comentarios; el cliente responde lo que le piden.
 *
 * Lo que la persona decidió (ya la vio, la ocultó) se guarda en Membership.prefs de ESTA cuenta.
 */
import type { FastifyInstance } from 'fastify';
export default function rutasPrimerosPasos(app: FastifyInstance): Promise<void>;
