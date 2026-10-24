/** Reglas compartidas (web y API): planes y quién invita a quién. */
import { describe, expect, it } from 'vitest';
import { planDe, planPermite, puedeInvitar } from '@lucuma-pm/shared';

describe('planPermite (el can() del plan)', () => {
  it('interno: sin límites', () => {
    expect(planPermite(planDe('interno'), { recurso: 'usuarios', actuales: 10_000 })).toEqual({ ok: true });
  });

  it('prueba: 5 personas de equipo; la sexta no', () => {
    const plan = planDe('prueba');
    expect(planPermite(plan, { recurso: 'usuarios', actuales: 4 })).toEqual({ ok: true });
    const r = planPermite(plan, { recurso: 'usuarios', actuales: 5 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/hasta 5 personas/);
    expect(planPermite(plan, { recurso: 'proyectos', actuales: 2, nuevos: 2 }).ok).toBe(false);
  });

  it('Account.limits sobrescribe el plan; ignora claves y valores raros', () => {
    expect(planDe('prueba', { maxUsuarios: null }).maxUsuarios).toBeNull();
    expect(planDe('interno', { maxUsuarios: 2 }).maxUsuarios).toBe(2);
    const raro = planDe('prueba', { maxUsuarios: '999', maxProyectos: -1, nombre: 'Hack', funciones: [] });
    expect(raro).toMatchObject({ nombre: 'Prueba', maxUsuarios: 5, maxProyectos: 3 });
    expect(raro.funciones.length).toBeGreaterThan(0);
  });

  it('plan desconocido cae en prueba (lo más restrictivo), no en interno', () => {
    expect(planDe('no-existe').nombre).toBe('Prueba');
  });

  it('funciones', () => {
    expect(planPermite(planDe('prueba'), { funcion: 'exportar' })).toEqual({ ok: true });
  });
});

describe('puedeInvitar', () => {
  it('owner y admin a cualquiera; equipo solo clientes; cliente a nadie', () => {
    for (const r of ['admin', 'member', 'client'] as const) {
      expect(puedeInvitar('owner', r)).toBe(true);
      expect(puedeInvitar('admin', r)).toBe(true);
      expect(puedeInvitar('client', r)).toBe(false);
    }
    expect(puedeInvitar('member', 'client')).toBe(true);
    expect(puedeInvitar('member', 'member')).toBe(false);
    expect(puedeInvitar('member', 'admin')).toBe(false);
  });
});
