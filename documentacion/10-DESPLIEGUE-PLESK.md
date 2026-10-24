# 10. Despliegue en Plesk

> Parte de la [documentación](00-INDICE.md). Estado y pendientes: [09-AVANCE.md](09-AVANCE.md).

Mismo patrón que el CRM (`lucuma-crm-inmobiliario/plataforma/docs/DEPLOY-PLESK.md`): **GitHub
compila, Plesk solo hace pull**. La diferencia: aquí lo compilado no se commitea en `main`, va a
una rama aparte, `produccion`, que arma CI (D-43).

## 0. Lo que tiene que existir antes

| Qué | Por qué | Estado |
|---|---|---|
| **PostgreSQL 13 o más** (ideal 16) en el servidor | La app usa Row Level Security y búsqueda de Postgres; MariaDB no sirve (D-12) | **Por confirmar (C-15)** |
| **Acceso de superusuario a Postgres una vez** (root por SSH o el usuario `postgres`) | Hay que crear dos roles con nombres exactos, `pm_admin` (BYPASSRLS) y `pm_app`. Desde la pantalla de bases de Plesk no se puede: no da BYPASSRLS y a veces cambia el nombre del usuario | **Por confirmar (C-15)** |
| Suscripción o dominio con SSL, p. ej. `proyectos.pruebalucuma.site` | La cookie de sesión exige HTTPS en producción | Por elegir (C-16) |
| Node.js 22 o 20 en la suscripción | Igual que el CRM; evitar versiones impares | |

Los nombres `pm_admin` y `pm_app` están escritos en las migraciones (permisos y políticas), por
eso tienen que ser exactamente esos.

## 1. Base de datos (una vez, como superusuario de Postgres)

```sql
CREATE ROLE pm_admin LOGIN PASSWORD '<clave larga 1>' BYPASSRLS;
CREATE ROLE pm_app   LOGIN PASSWORD '<clave larga 2>' NOBYPASSRLS;
CREATE DATABASE lucuma_pm OWNER pm_admin;
```

- `pm_admin` es dueño de las tablas y corre las migraciones y los comandos de consola.
- `pm_app` es el que usa la API: sin privilegios, todo lo que consulta pasa por RLS.
- Sin `CREATEDB`: `migrate deploy` no usa base temporal.

## 2. Aplicación (Plesk → Node.js)

| Campo | Valor |
|---|---|
| Versión de Node | 22 (o 20) |
| Raíz de la aplicación | la raíz del repo (`/httpdocs` o donde lo deje Git) |
| **Raíz del documento** | `<raíz>/public` (el SPA compilado; nginx solo publica eso, nunca el código) |
| **Archivo de arranque** | `packages/api/dist/server.js` |
| Modo | production |

Passenger deduce la raíz de la aplicación como la carpeta padre del docroot: por eso el docroot
es `public/` en la raíz del repo (lección del CRM).

### Variables de entorno

Ponerlas **en el `.env` de la raíz** (y, si se quiere, también en el panel). El `.env` es lo
que leen los comandos de consola (`Run script`), que no reciben las variables del panel.

```bash
NODE_ENV=production
DATABASE_URL="postgresql://pm_app:<clave 2>@localhost:5432/lucuma_pm"
DATABASE_ADMIN_URL="postgresql://pm_admin:<clave 1>@localhost:5432/lucuma_pm"
APP_URL="https://proyectos.pruebalucuma.site"
SESSION_SECRET="<texto aleatorio largo>"
BASE_DOMAIN=""        # un solo dominio por ahora: la cuenta se elige al entrar (D-24)
SOPORTE_BETA=1
```

`PORT` lo pone Passenger. Sin `SMTP_HOST` no sale ningún correo (D-32): la web oculta el
acceso por enlace y la ruta responde 503.

## 3. Git de Plesk

- Repositorio: `https://github.com/LucumaAgency/project-managment.git` (público, no pide clave).
- **Rama: `produccion`** (no `main`: `main` no trae lo compilado).
- Despliegue automático o con el botón, y estas **acciones adicionales**:

```bash
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
mkdir -p tmp && touch tmp/restart.txt
```

- `npm ci --omit=dev` deja la CLI de Prisma (está en `dependencies` a propósito) y no instala
  `tsx`, `vite` ni `vitest`.
- `prisma generate` corre siempre en el servidor: descarga el motor de Prisma para ESE sistema.
- `migrate deploy` solo aplica migraciones ya escritas; nunca borra datos.

### Si las acciones adicionales fallan (PATH de Node o shell enjaulado)

Hacerlo a mano en **Node.js**, en este orden:

| # | Paso | Cuándo |
|---|---|---|
| 1 | Desplegar desde Git | siempre |
| 2 | **NPM install** (botón del panel) | si cambió `package.json` |
| 3 | Run script `prisma:generate` | siempre |
| 4 | Run script `prisma:deploy` | siempre (si no hay migraciones nuevas, no hace nada) |
| 5 | Reiniciar la aplicación | siempre |

## 4. Primer arranque

En **Node.js → Run script**:

```
cuenta:crear:prod -- lucuma "Lucuma Agency" dev@lucumaagency.com "Equipo Lucuma"
usuario:prod -- soporte dev@lucumaagency.com
```

El primero imprime la contraseña del dueño **una sola vez**. El segundo lo marca como soporte
(entra a cualquier cuenta durante la beta). Contraseña olvidada: `usuario:prod -- clave <correo>`.

## 5. Verificación

- `https://<dominio>/api/v1/salud` → `{"ok":true,"postgres":"16.x","rol":"pm_app"}`. Si `rol`
  dice `pm_admin`, el `DATABASE_URL` está mal y RLS no protege nada: corregir antes de seguir.
- Entrar con el correo y la contraseña del paso 4; crear un proyecto.
- Recargar la página dentro de un proyecto (`/proyectos/…`): debe abrir, no dar 404.
- `logs/app.txt` (raíz, fuera del docroot) tiene las peticiones y los errores.

## 6. Lo que todavía no hace falta

- **Tarea programada / worker:** no hay cola hasta el día 11. Cuando llegue, mismo esquema que
  el CRM (`bin/worker.sh` o latido externo si el cron corre enjaulado).
- **Subdominios por cuenta:** con `BASE_DOMAIN` vacío todo vive en un dominio. Para pasar a
  `<cuenta>.dominio` se usa el mismo truco de nginx del CRM (`docs/21-DOS-ORGANIZACIONES-PLESK.md`).

## 7. Simulacro (2026-10-24)

Probado en local partiendo de una carpeta limpia (solo el código + lo compilado, sin
`node_modules`) y una base vacía, con `NODE_ENV=production`:

- `npm ci --omit=dev`: queda `prisma`, no quedan `tsx`, `vite` ni `vitest`.
- `prisma generate` + `migrate deploy`: las 5 migraciones aplicadas.
- `cuenta:crear:prod`: crea la cuenta e imprime la contraseña.
- La API compilada: `/api/v1/salud` con rol `pm_app`; `/`, `/entrar`, `/proyectos/abc` e
  `/invitacion?token=…` devuelven la web; `/favicon.svg` el archivo; un `.js` que no existe y
  una ruta de API que no existe dan 404; login, `/yo` y crear proyecto funcionan; el log se
  escribe en `logs/app.txt`.
- Encontrado y corregido: el enlace al correo sin SMTP respondía 500 en vez de 503.
