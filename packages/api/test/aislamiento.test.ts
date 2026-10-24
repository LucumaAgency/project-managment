/**
 * Aislamiento entre cuentas: lo más grave que puede fallar en el producto.
 *
 * Todo lo que lee o escribe la app pasa por el rol pm_app y por `conCuenta()` (el mismo
 * camino que usan las rutas). Los datos de control se miran con pm_admin, que salta RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, prismaAdmin } from '../src/db.js';
import { conCuenta, conUsuario } from '../src/lib/contexto.js';
import { sembrarCuenta, unirACuenta, type Semilla } from './semilla.js';

/** Tablas que NO llevan RLS, a propósito (ver migración rls_busqueda). */
const SIN_RLS = new Set(['users', 'login_tokens', 'sessions', 'jobs', '_prisma_migrations']);

interface InfoTabla {
  tabla: string;
  rls: boolean;
  politicas: number;
  tieneAccountId: boolean;
  tieneRecordingId: boolean;
}

let tablas: InfoTabla[] = [];
/** Nombres reales de los roles (en los tests llevan el prefijo plesk_, como en Plesk). */
let rolApp = '';
let rolAdmin = '';
let A: Semilla;
let B: Semilla;

/** Condición SQL que dice "esta fila es de la cuenta $1", según cómo cuelga la tabla. */
function condicionDeCuenta(t: InfoTabla): string {
  if (t.tabla === 'accounts') return 'id = $1';
  if (t.tieneAccountId) return '"accountId" = $1';
  if (t.tieneRecordingId) return '"recordingId" IN (SELECT id FROM recordings WHERE "accountId" = $1)';
  throw new Error(`La tabla ${t.tabla} no tiene accountId ni recordingId: definir cómo se aísla.`);
}

async function filasDeCuentaSegunAdmin(t: InfoTabla, accountId: string): Promise<number> {
  const [r] = await prismaAdmin.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "${t.tabla}" WHERE ${condicionDeCuenta(t)}`,
    accountId
  );
  return r.n;
}

const contar = (tx: { $queryRawUnsafe: typeof prisma.$queryRawUnsafe }, tabla: string) =>
  tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${tabla}"`).then((r) => r[0].n);

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  rolApp = (await prisma.$queryRaw<{ u: string }[]>`SELECT current_user AS u`)[0].u;
  rolAdmin = (await prismaAdmin.$queryRaw<{ u: string }[]>`SELECT current_user AS u`)[0].u;
  tablas = await prismaAdmin.$queryRaw<InfoTabla[]>`
    SELECT c.relname AS tabla,
           c.relrowsecurity AS rls,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS politicas,
           EXISTS (SELECT 1 FROM information_schema.columns k
                   WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'accountId') AS "tieneAccountId",
           EXISTS (SELECT 1 FROM information_schema.columns k
                   WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'recordingId') AS "tieneRecordingId"
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`;
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

const conRls = () => tablas.filter((t) => !SIN_RLS.has(t.tabla));

describe('estructura', () => {
  it('toda tabla (salvo las exentas) tiene RLS activado y con política', () => {
    const fallas = conRls()
      .filter((t) => !t.rls || t.politicas === 0)
      .map((t) => `${t.tabla}: rls=${t.rls} políticas=${t.politicas}`);
    // Si esto falla tras agregar una tabla: falta su ENABLE ROW LEVEL SECURITY y su política.
    expect(fallas).toEqual([]);
  });

  it('las tablas son de pm_admin y pm_app no hereda nada de él (sin FORCE, eso es lo que aísla)', async () => {
    // D-44: el dueño salta RLS por serlo. Si pm_app fuera dueño de una tabla, o miembro de
    // pm_admin, también la saltaría.
    const [r] = await prismaAdmin.$queryRaw<{ ajenas: string[]; deApp: number; miembro: boolean; forzadas: number }[]>`
      SELECT
        coalesce(array_agg(c.relname) FILTER (WHERE pg_get_userbyid(c.relowner) <> ${rolAdmin}), '{}') AS ajenas,
        count(*) FILTER (WHERE pg_get_userbyid(c.relowner) = ${rolApp})::int AS "deApp",
        pg_has_role(${rolApp}, ${rolAdmin}, 'MEMBER') AS miembro,
        count(*) FILTER (WHERE c.relforcerowsecurity)::int AS forzadas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`;
    expect(r).toEqual({ ajenas: [], deApp: 0, miembro: false, forzadas: 0 });
  });

  it('pm_admin no tiene BYPASSRLS ni es superusuario (como en Plesk): ve todo solo por ser dueño', async () => {
    const [r] = await prismaAdmin.$queryRaw<{ bypass: boolean; superuser: boolean }[]>`
      SELECT rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = ${rolAdmin}`;
    expect(r).toEqual({ bypass: false, superuser: false });
  });

  it('las tablas exentas siguen siendo solo las previstas', () => {
    const exentasReales = tablas.filter((t) => !t.rls).map((t) => t.tabla);
    expect(new Set(exentasReales)).toEqual(new Set([...SIN_RLS].filter((t) => tablas.some((x) => x.tabla === t))));
  });

  it('la semilla puso filas de ambas cuentas en cada tabla con RLS (si no, el test no prueba nada)', async () => {
    const vacias: string[] = [];
    for (const t of conRls()) {
      for (const c of [A, B]) {
        if ((await filasDeCuentaSegunAdmin(t, c.accountId)) === 0) vacias.push(`${t.tabla} (${c.slug})`);
      }
    }
    expect(vacias).toEqual([]);
  });

  it('pm_app no puede saltarse RLS', async () => {
    const [r] = await prisma.$queryRaw<{ usuario: string; bypass: boolean; superuser: boolean }[]>`
      SELECT current_user AS usuario, rolbypassrls AS bypass, rolsuper AS superuser
      FROM pg_roles WHERE rolname = current_user`;
    expect(r).toEqual({ usuario: rolApp, bypass: false, superuser: false });
  });

  it('los roles llevan el prefijo de Plesk y las migraciones lo resolvieron solas', () => {
    expect([rolAdmin, rolApp]).toEqual(['plesk_pm_admin', 'plesk_pm_app']);
  });
});

describe('lectura', () => {
  it('sin cuenta fijada, pm_app no ve ninguna fila de ninguna tabla con RLS', async () => {
    for (const t of conRls()) {
      expect({ tabla: t.tabla, filas: await contar(prisma, t.tabla) }).toEqual({ tabla: t.tabla, filas: 0 });
    }
  });

  it('con la cuenta A, cada tabla devuelve exactamente las filas de A', async () => {
    // El dueño de A solo está en A: así memberships no suma filas propias de otras cuentas.
    const ctx = { accountId: A.accountId, userId: A.ownerId };
    for (const t of conRls()) {
      const vistas = await conCuenta(ctx, (tx) => contar(tx, t.tabla));
      const deA = await filasDeCuentaSegunAdmin(t, A.accountId);
      expect({ tabla: t.tabla, vistas }).toEqual({ tabla: t.tabla, vistas: deA });
    }
  });

  it('con la cuenta A no aparece ningún id de B', async () => {
    const ctx = { accountId: A.accountId, userId: A.ownerId };
    const vistos = await conCuenta(ctx, async (tx) => ({
      cuentas: await tx.account.findMany({ select: { id: true } }),
      proyectos: await tx.project.findMany({ select: { accountId: true } }),
      elementos: await tx.recording.findMany({ select: { accountId: true } }),
    }));
    expect(vistos.cuentas.map((c) => c.id)).toEqual([A.accountId]);
    expect(vistos.proyectos.every((p) => p.accountId === A.accountId)).toBe(true);
    expect(vistos.elementos.every((r) => r.accountId === A.accountId)).toBe(true);
    expect(await conCuenta(ctx, (tx) => tx.recording.findUnique({ where: { id: B.todoId } }))).toBeNull();
  });

  it('la cuenta fijada no se filtra a la siguiente consulta del pool', async () => {
    for (let i = 0; i < 10; i++) {
      await conCuenta({ accountId: A.accountId, userId: A.ownerId }, (tx) => tx.project.count());
      expect(await prisma.project.count()).toBe(0);
    }
  });

  it('la búsqueda solo encuentra en la cuenta activa', async () => {
    const buscar = (ctx: { accountId: string; userId: string }, palabra: string) =>
      conCuenta(ctx, (tx) =>
        tx.$queryRaw<{ id: string }[]>`SELECT id FROM recordings WHERE search @@ plainto_tsquery('simple', ${palabra})`
      );
    const ctxA = { accountId: A.accountId, userId: A.ownerId };
    const ctxB = { accountId: B.accountId, userId: B.ownerId };
    expect(await buscar(ctxA, B.palabraUnica)).toEqual([]);
    expect(await buscar(ctxB, B.palabraUnica)).toEqual([{ id: B.todoId }]);
  });
});

describe('escritura', () => {
  const ctxA = () => ({ accountId: A.accountId, userId: A.ownerId });
  const RLS = /row-level security/;

  it('no puede crear filas en otra cuenta', async () => {
    await expect(
      conCuenta(ctxA(), (tx) => tx.project.create({ data: { accountId: B.accountId, name: 'intruso', createdById: A.ownerId } }))
    ).rejects.toThrow(RLS);
    await expect(
      conCuenta(ctxA(), (tx) => tx.membership.create({ data: { accountId: B.accountId, userId: A.ownerId, role: 'owner' } }))
    ).rejects.toThrow(RLS);
  });

  it('no puede colgar detalle de un elemento de otra cuenta', async () => {
    await expect(conCuenta(ctxA(), (tx) => tx.todoDetail.create({ data: { recordingId: B.messageId } }))).rejects.toThrow(RLS);
  });

  it('no puede pasar una fila propia a otra cuenta', async () => {
    await expect(
      conCuenta(ctxA(), (tx) => tx.project.update({ where: { id: A.projectId }, data: { accountId: B.accountId } }))
    ).rejects.toThrow(RLS);
  });

  it('no puede modificar ni borrar filas de otra cuenta', async () => {
    const r = await conCuenta(ctxA(), async (tx) => ({
      editados: (await tx.recording.updateMany({ where: { id: B.todoId }, data: { title: 'hackeado' } })).count,
      borrados: (await tx.project.deleteMany({ where: { id: B.projectId } })).count,
      cuentas: (await tx.account.updateMany({ where: { id: B.accountId }, data: { name: 'hackeada' } })).count,
    }));
    expect(r).toEqual({ editados: 0, borrados: 0, cuentas: 0 });

    const todoB = await prismaAdmin.recording.findUniqueOrThrow({ where: { id: B.todoId } });
    expect(todoB.title).toContain(B.palabraUnica);
    expect(await prismaAdmin.project.count({ where: { id: B.projectId } })).toBe(1);
  });
});

describe('persona en varias cuentas', () => {
  it('ve sus membresías en otras cuentas, pero solo puede tocar las de la cuenta activa', async () => {
    // El equipo de A también es cliente en B.
    await unirACuenta(A.memberId, B.accountId, 'client');
    const ctx = { accountId: A.accountId, userId: A.memberId };

    const visibles = await conCuenta(ctx, (tx) => tx.membership.findMany({ select: { accountId: true, userId: true } }));
    const deB = visibles.filter((m) => m.accountId === B.accountId);
    expect(deB).toEqual([{ accountId: B.accountId, userId: A.memberId }]); // solo la suya, no las demás de B

    const cambiadas = await conCuenta(ctx, (tx) =>
      tx.membership.updateMany({ where: { accountId: B.accountId, userId: A.memberId }, data: { role: 'owner' } })
    );
    expect(cambiadas.count).toBe(0);
    const enB = await prismaAdmin.membership.findUniqueOrThrow({
      where: { accountId_userId: { accountId: B.accountId, userId: A.memberId } },
    });
    expect(enB.role).toBe('client');
  });

  it('cuentas_de_usuario() lista sus cuentas solo con el usuario fijado', async () => {
    expect(await prisma.$queryRaw`SELECT * FROM cuentas_de_usuario()`).toEqual([]);
    const propias = await conUsuario(A.memberId, (tx) =>
      tx.$queryRaw<{ id: string; role: string }[]>`SELECT id, role FROM cuentas_de_usuario()`
    );
    expect(new Map(propias.map((c) => [c.id, c.role]))).toEqual(
      new Map([
        [A.accountId, 'member'],
        [B.accountId, 'client'],
      ])
    );
  });
});

describe('resolver la cuenta antes de saberla', () => {
  it('cuenta_por_slug() devuelve solo columnas mínimas', async () => {
    const filas = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM cuenta_por_slug(${A.slug})`;
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0]).sort()).toEqual(['cerrada', 'id', 'locale', 'name', 'plan', 'slug', 'timeZone']);
    expect(filas[0].id).toBe(A.accountId);
    expect(await prisma.$queryRaw`SELECT * FROM cuenta_por_slug('no-existe')`).toEqual([]);
  });
});

describe('invitaciones y soporte antes de la cuenta', () => {
  it('invitacion_por_token() solo encuentra con el hash exacto', async () => {
    const inv = await prismaAdmin.invitation.findFirstOrThrow({ where: { accountId: A.accountId } });
    const [fila] = await prisma.$queryRaw<{ accountId: string }[]>`SELECT * FROM invitacion_por_token(${inv.tokenHash})`;
    expect(fila.accountId).toBe(A.accountId);
    expect(await prisma.$queryRaw`SELECT * FROM invitacion_por_token('')`).toEqual([]);
    expect(await prisma.$queryRaw`SELECT * FROM invitacion_por_token(NULL)`).toEqual([]);
  });

  it('cuentas_para_soporte() está vacía si la persona fijada no es staff', async () => {
    expect(await prisma.$queryRaw`SELECT * FROM cuentas_para_soporte()`).toEqual([]);
    expect(await conUsuario(A.ownerId, (tx) => tx.$queryRaw`SELECT * FROM cuentas_para_soporte()`)).toEqual([]);
  });
});

