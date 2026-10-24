# 10. Despliegue en Plesk

> Parte de la [documentación](00-INDICE.md). Estado y pendientes: [09-AVANCE.md](09-AVANCE.md).

Mismo patrón que el CRM (`lucuma-crm-inmobiliario/plataforma/docs/DEPLOY-PLESK.md`): **GitHub
compila, Plesk solo hace pull**. La diferencia: aquí lo compilado no se commitea en `main`, va a
una rama aparte, `produccion`, que arma CI (D-43).

## 0. Lo que tiene que existir antes

| Qué | Por qué | Estado |
|---|---|---|
| PostgreSQL 12 o más | La app usa Row Level Security y búsqueda de Postgres; MariaDB no sirve (D-12) | ✅ El servidor tiene **12.22**; la suite completa pasa en 12.22 (D-45) |
| Root o superusuario de Postgres | **No hace falta** (D-44): alcanza con dos usuarios comunes creados desde Plesk | Sin root, está bien |
| Dominio con SSL: `proyectos.pruebalucuma.site` | La cookie de sesión exige HTTPS en producción | ✅ Elegido por el usuario |
| Node.js 22 o 20 en la suscripción | Igual que el CRM; evitar versiones impares. Con `arranque.cjs` arranca en cualquiera, incluida la 21 | |

## 1. Base de datos (Plesk → Bases de datos)

Plesk antepone el usuario de la suscripción a los nombres: en este servidor, `carlosm_`. Está
bien: las migraciones deducen el nombre del usuario de la app a partir del administrador
(`carlosm_pm_admin` → `carlosm_pm_app`, D-45).

1. **Añadir base de datos**: tipo PostgreSQL, nombre `lucuma_pm` (queda **`carlosm_lucuma_pm`**),
   sitio `proyectos.pruebalucuma.site`. En el mismo formulario, el usuario **`pm_admin`** (queda
   **`carlosm_pm_admin`**). Es el que crea las tablas.
2. En esa base → **Gestión de usuarios** → **Añadir usuario**: **`pm_app`** (queda
   **`carlosm_pm_app`**). Es el que usa la API.
3. En los dos usuarios, **desmarcar** "El usuario tiene acceso a todas las bases de datos de la
   suscripción": cada uno solo necesita esta base.

**Contraseñas:** largas y **solo con letras y números** (20 o más). Van dentro de una dirección
de conexión, y ahí `@`, `:`, `/`, `#`, `?` o `%` la rompen. Si la clave trae alguno, hay que
escribirlo codificado en el `.env` (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`,
`?` → `%3F`, `%` → `%25`). Nunca pegar las claves en un chat ni en el repo.

El sufijo tiene que ser **exactamente** `pm_admin` y `pm_app`: es lo que buscan las migraciones.

Por qué alcanza sin superusuario (D-44): Postgres no aplica las políticas de una tabla a su
dueño. `carlosm_pm_admin` es dueño de todo (corre las migraciones) y ve todo; `carlosm_pm_app` no
es dueño de nada ni miembro del administrador, así que todo lo que consulta pasa por RLS.

## 2. Aplicación (Plesk → Node.js)

| Campo | Valor |
|---|---|
| Versión de Node | 22 (o 20) |
| Raíz de la aplicación | la raíz del repo (`/httpdocs` o donde lo deje Git) |
| **Raíz del documento** | `<raíz>/public` (el SPA compilado; nginx solo publica eso, nunca el código) |
| **Archivo de arranque** | **`arranque.cjs`** (no `packages/api/dist/server.js`, ver abajo) |
| Modo | production |

Passenger deduce la raíz de la aplicación como la carpeta padre del docroot: por eso el docroot
es `public/` en la raíz del repo (lección del CRM).

**Por qué `arranque.cjs`:** Passenger carga el archivo de inicio con `require()`. La API es un
módulo ES, y `require()` de un módulo ES solo funciona en Node 20.19+ y 22.12+. Con la 21.7.3
que traía la suscripción, Plesk mostró *Error starting web application* con `ERR_REQUIRE_ESM`
(2026-10-24). `arranque.cjs` es un archivo CommonJS de tres líneas que carga la API con
`import()`, y funciona en cualquier versión.

### Variables de entorno

Ponerlas **en el `.env` de la raíz** (y, si se quiere, también en el panel). El `.env` es lo
que leen los comandos de consola (`Run script`), que no reciben las variables del panel.

```bash
NODE_ENV=production
DATABASE_URL="postgresql://carlosm_pm_app:<clave de pm_app>@localhost:5432/carlosm_lucuma_pm"
DATABASE_ADMIN_URL="postgresql://carlosm_pm_admin:<clave de pm_admin>@localhost:5432/carlosm_lucuma_pm"
APP_URL="https://proyectos.pruebalucuma.site"
SESSION_SECRET="<texto aleatorio largo>"
BASE_DOMAIN=          # vacío y SIN comillas: un solo dominio, la cuenta se elige al entrar (D-24)
SOPORTE_BETA=1
```

`PORT` lo pone Passenger. Ojo con Node 21: su lector de `.env` dejaba `BASE_DOMAIN=""` como
el texto `""` y rompía la cookie (500 al entrar). Desde el 2026-10-24 la app quita esas comillas
sola, pero lo más simple es escribir `BASE_DOMAIN=` sin nada. Sin `SMTP_HOST` no sale ningún correo (D-32): la web oculta el
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

En **Node.js → Run script**, en orden:

```
base:verificar:prod
prisma:deploy
base:verificar:prod
cuenta:crear:prod -- lucuma "Lucuma Agency" dev@lucumaagency.com "Equipo Lucuma"
usuario:prod -- soporte dev@lucumaagency.com
```

`base:verificar:prod` no cambia nada: revisa que los dos usuarios quedaron bien (versión,
nombres, que `pm_admin` puede crear tablas, que `pm_app` no tiene privilegios de más ni es
miembro de `pm_admin`, que las tablas son de `pm_admin`, que tienen RLS y que `pm_app` sin
cuenta no ve nada). La primera vez dirá que todavía no hay tablas; después del `prisma:deploy`
tiene que decir **Todo en orden**. Si algo dice FALLA, no seguir.

El primero imprime la contraseña del dueño **una sola vez**. El segundo lo marca como soporte
(entra a cualquier cuenta durante la beta). Contraseña olvidada: `usuario:prod -- clave <correo>`.

## 5. Verificación

- `base:verificar:prod` dice **Todo en orden**.
- `https://<dominio>/api/v1/salud` → `{"ok":true,"postgres":"…","rol":"pm_app"}`. Si `rol`
  dice `pm_admin`, el `DATABASE_URL` está mal y RLS no protege nada: corregir antes de seguir.
- Entrar con el correo y la contraseña del paso 4; crear un proyecto.
- Recargar la página dentro de un proyecto (`/proyectos/…`): debe abrir, no dar 404.
- `logs/app.txt` (raíz, fuera del docroot) tiene las peticiones y los errores.

## 6. Lo que todavía no hace falta

- **Tarea programada / worker:** no hay cola hasta el día 11. Cuando llegue, mismo esquema que
  el CRM (`bin/worker.sh` o latido externo si el cron corre enjaulado).
- **Subdominios por cuenta:** con `BASE_DOMAIN` vacío todo vive en un dominio. Para pasar a
  `<cuenta>.dominio` se usa el mismo truco de nginx del CRM (`docs/21-DOS-ORGANIZACIONES-PLESK.md`).

## 7. Simulacros (2026-10-24)

**PostgreSQL 12.22 como en Plesk** (D-45): base a nombre del servidor (no del usuario), usuarios
`plesk_pm_admin` y `plesk_pm_app` con permisos sobre la base. Las migraciones corren, los 116
tests pasan y `base:verificar` dice Todo en orden.

**Despliegue completo:**

Probado en local partiendo de una carpeta limpia (solo el código + lo compilado, sin
`node_modules`) y una base vacía, con `NODE_ENV=production`:

- `npm ci --omit=dev`: queda `prisma`, no quedan `tsx`, `vite` ni `vitest`.
- `prisma generate` + `migrate deploy`: las migraciones aplicadas (5 en el simulacro; desde D-44 son 6).
- `cuenta:crear:prod`: crea la cuenta e imprime la contraseña.
- La API compilada: `/api/v1/salud` con rol `pm_app`; `/`, `/entrar`, `/proyectos/abc` e
  `/invitacion?token=…` devuelven la web; `/favicon.svg` el archivo; un `.js` que no existe y
  una ruta de API que no existe dan 404; login, `/yo` y crear proyecto funcionan; el log se
  escribe en `logs/app.txt`.
- Encontrado y corregido: el enlace al correo sin SMTP respondía 500 en vez de 503.
