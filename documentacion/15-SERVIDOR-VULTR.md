# 15. Servidor propio en Vultr

> Parte de la [documentación](00-INDICE.md). Preparado el 2026-10-25 para el paso 2 de la
> [fase 3](14-FASE-3-VENDER.md). **Sin ejecutar:** falta el dominio. El espacio para archivos
> está en [16-ESPACIO-DE-ARCHIVOS.md](16-ESPACIO-DE-ARCHIVOS.md).

Hoy la app vive en el Plesk compartido (guía en [10](10-DESPLIEGUE-PLESK.md)). Sirve para la
beta interna, pero no para vender: comparte el usuario del sistema con decenas de sitios, no
tiene tareas programadas de verdad (el latido viene de cron-job.org) y no da un certificado
comodín cómodo para `<agencia>.dominio.com`. Mismo diagnóstico que el CRM inmobiliario
(`/home/claude-user/lucuma/SERVIDORES.md`, sección «El CRM inmobiliario»).

## 1. Qué se contrata

Criterio de Lucuma (SERVIDORES.md, 2026-09-29): **Vultr, São Paulo** (lo más cerca de Lima,
cobro por hora, sin contrato). Confirmar precios en https://www.vultr.com/pricing/ al contratar.

| Concepto | Al mes |
|---|---|
| Cloud Compute 1 vCPU · 2 GB · 55 GB · São Paulo · **Ubuntu 24.04** | $10 |
| Copias automáticas de Vultr (el servidor entero) | $2 |
| Dominio propio | ~$1 |
| Cloudflare (DNS, proxy, certificado comodín) | gratis |
| **Total** | **~$13** |

**Por qué alcanza el de $10:** la app en reposo (Node + PostgreSQL) usa menos de 500 MB. La
carga real son las personas conectadas a la vez. La beta (3 a 5 agencias) queda sobrada.

**Por qué no el de $5:** con 1 GB, `npm ci` y `prisma generate` se quedan sin memoria (igual que
en el CRM). El script además agrega 2 GB de memoria de intercambio.

**Cuándo subir al de $20 (2 vCPU · 4 GB):** con unas 10 agencias, más de 40 personas a la vez o
el disco pasado del 70 %. Se cambia con un clic en Vultr, sin mudar nada.

**Sin panel** (ni CloudPanel ni Plesk): es una sola app Node, no varios WordPress. Un panel
agrega algo más que actualizar y no resuelve nada que el script no haga.

### ¿Junto con el CRM?

Mientras los dos estén en beta, pueden compartir un servidor de $20 (~$25 con copias) en lugar
de dos de $10. El día que uno tenga clientes que pagan, separarlos: si uno se cae o lo atacan,
el otro sigue. El script de este repo asume un servidor solo para Proyectos.

## 2. Cómo queda armado

```
Cloudflare (DNS *.dominio.com, proxy naranja, SSL "Full (strict)")
   │
Vultr · Ubuntu 24.04
   ├─ nginx :443  ── certificado de origen de Cloudflare (comodín, 15 años)
   │     └─ proxy a 127.0.0.1:3100
   ├─ proyectos.service      la app (node packages/api/dist/server.js), usuario `proyectos`
   ├─ proyectos-latido.timer cada 15 min: recordatorios, purga de papelera, respaldo diario
   ├─ PostgreSQL 16          base lucuma_pm · dueño pm_admin · la app entra como pm_app (RLS)
   └─ /srv/proyectos/
        ├─ app/              clon de la rama `produccion` (la arma CI, D-43) + .env
        └─ datos/
             ├─ archivos/    lo que suben las agencias (ARCHIVOS_DIR)
             └─ respaldos/   pg_dump diario, 14 días (RESPALDOS_DIR)
```

El flujo de siempre no cambia: se programa en `main`, CI prueba y arma `produccion`, y el
servidor solo jala lo compilado.

Archivos en el repo, en `deploy/vultr/`:

| Archivo | Qué hace |
|---|---|
| `instalar.sh` | Deja el servidor listo desde cero. Se puede repetir sin romper nada |
| `actualizar.sh` | El "Desplegar" de Plesk en un comando: jala, instala, migra, verifica, reinicia |
| `nginx.conf` | Plantilla de nginx (comodín, subidas de hasta 64 MB, IP real detrás de Cloudflare) |
| `permisos-app.sql` | Permisos de `pm_app` después de restaurar un respaldo traído de Plesk |

## 3. Paso a paso: servidor nuevo

### 3.1 Vultr
1. Deploy → Cloud Compute → Regular Performance → **São Paulo** → **Ubuntu 24.04** → plan de
   **$10** (1 vCPU, 2 GB).
2. Marcar **Auto Backups**. Agregar la llave SSH (no entrar con contraseña).
3. Anotar la IP.

### 3.2 Cloudflare
1. Agregar el dominio a Cloudflare y cambiar los nameservers en el registrador.
2. DNS: registro `A` de `@` a la IP y registro `A` de `*` a la IP, los dos con **proxy naranja**.
   El certificado gratis de Cloudflare cubre `dominio.com` y `*.dominio.com` (un nivel). Por eso
   las agencias van en `agencia.dominio.com` y no en `agencia.app.dominio.com`.
3. SSL/TLS → modo **Full (strict)**.
4. SSL/TLS → Origin Server → **Create Certificate** (`dominio.com` y `*.dominio.com`, 15 años).
   Guardar el certificado y la llave privada. La llave se ve una sola vez.

### 3.3 Instalar
```bash
ssh root@<IP>
curl -fsSL https://raw.githubusercontent.com/LucumaAgency/project-managment/main/deploy/vultr/instalar.sh -o instalar.sh
DOMINIO=dominio.com bash instalar.sh
```
Tarda unos 5 minutos. Crea los usuarios de la base con claves nuevas y escribe el `.env` con
claves nuevas: `SESSION_SECRET`, `CRON_TOKEN` y las de la base. Así se cumple el "cambiar todas
las claves" de la fase 3 sin hacer nada aparte. Al final muestra la salud de la app y el
resultado de `base:verificar`.

### 3.4 Certificado y clave de accesos
```bash
nano /etc/ssl/proyectos/origen.pem    # pegar el certificado de Cloudflare
nano /etc/ssl/proyectos/origen.key    # pegar la llave privada
systemctl reload nginx
nano /srv/proyectos/app/.env          # ACCESOS_CLAVE= (ver abajo)
systemctl restart proyectos
```
- **Mudanza desde Plesk:** `ACCESOS_CLAVE` tiene que ser **la misma** que la de Plesk. Con otra,
  los accesos protegidos ya guardados (contraseñas de hosting, dominio…) no se pueden leer.
- **Instalación desde cero:** una nueva, con `openssl rand -hex 32`.
- Copiar el `.env` completo a un gestor de contraseñas, fuera del servidor.

### 3.5 Revisar
- `https://dominio.com/api/v1/salud` → `"rol":"pm_app"`.
- `systemctl list-timers proyectos-latido` → tiene próxima ejecución.
- Logs: `journalctl -u proyectos -f` y `/srv/proyectos/app/logs/app.txt`.

## 4. Desplegar una versión nueva

```bash
ssh root@<IP> 'bash /srv/proyectos/app/deploy/vultr/actualizar.sh'
```
Reemplaza la secuencia de Plesk (Desplegar → prisma:generate → prisma:deploy →
base:verificar:prod → Reiniciar). Las migraciones se aplican siempre; si no hay nuevas, no hacen
nada. Si algo falla, se detiene antes de reiniciar y la versión anterior sigue funcionando.

Más adelante se puede automatizar desde GitHub Actions (un paso por SSH al final del trabajo
`produccion`), pero conviene hacerlo a mano las primeras veces.

## 5. Mudanza desde Plesk

Se hace en una ventana corta. Mientras dura, nadie debe usar la app, para que no se pierdan
cambios: avisar al equipo y elegir una noche.

**Antes (sin apuro):** servidor instalado con `MUDANZA=1` (paso 3.3, sin migraciones), con el
certificado y la `ACCESOS_CLAVE` de Plesk ya puestos.

```bash
MUDANZA=1 DOMINIO=dominio.com bash instalar.sh
```

**La ventana (unos 30 minutos):**

1. **Plesk → Node.js → Run script `respaldo:prod`.** Deja `privados/respaldos/base-AAAA-MM-DD.dump`
   y la lista `archivos-AAAA-MM-DD.tsv`.
2. **Plesk → Administrador de archivos:** comprimir `privados/archivos` en un zip y descargar el
   zip, el `.dump` y el `.tsv`.
3. Subirlos al servidor nuevo:
   ```bash
   scp base-*.dump archivos-*.tsv archivos.zip root@<IP>:/root/
   ```
4. Restaurar la base. El respaldo de Plesk nombra los roles `carlosm_…`, así que se restaura sin
   dueños ni permisos, y después se dan los de `pm_app`:
   ```bash
   cd /srv/proyectos/app && set -a && . ./.env && set +a
   systemctl stop proyectos
   pg_restore --no-owner --no-privileges --exit-on-error -d "${DATABASE_ADMIN_URL%%\?*}" /root/base-*.dump
   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f deploy/vultr/permisos-app.sql
   sudo -u proyectos npx prisma migrate deploy        # por si el servidor nuevo trae migraciones más nuevas
   sudo -u proyectos node packages/api/dist/scripts/verificar-base.js   # tiene que decir "Todo en orden"
   ```
   Plesk tiene PostgreSQL 12 y aquí es 16: `pg_restore` 16 lee respaldos de versiones viejas sin
   problema. Al revés no funciona, pero eso no aplica.
5. Archivos:
   ```bash
   apt-get install -y unzip && unzip -q /root/archivos.zip -d /root/archivos-plesk
   cp -a /root/archivos-plesk/archivos/. /srv/proyectos/datos/archivos/
   chown -R proyectos:proyectos /srv/proyectos/datos/archivos
   # Comprobar que no falta ninguno (la lista viene del respaldo):
   tail -n +2 /root/archivos-*.tsv | cut -f2 | while read k; do [ -f "/srv/proyectos/datos/archivos/$k" ] || echo "FALTA $k"; done
   systemctl start proyectos
   ```
   Revisar la ruta dentro del zip: depende de cómo lo arme Plesk. Lo que tiene que quedar es
   `/srv/proyectos/datos/archivos/<idDeCuenta>/<año>/<mes>/<archivo>`.
6. **Probar:** entrar, abrir un proyecto, descargar un archivo viejo y revelar un acceso protegido.
   Esto último confirma que la `ACCESOS_CLAVE` es la correcta.
7. **Redirigir lo viejo:** en Plesk, `proyectos.pruebalucuma.site` redirige (301) a
   `https://lucuma.dominio.com`, para que los marcadores y los enlaces ya compartidos sigan
   funcionando. Apagar la app de Plesk sin borrarla todavía.
8. **Asistente de Telegram:** cambiar la URL base en `~/carlos/bin/proyectos.py` y reiniciar el
   bot. La clave del bot sigue valiendo: viaja en la base. Desactivar el latido de cron-job.org,
   porque ahora lo hace el servidor.
9. Una semana después, sin problemas: borrar la app y la base de Plesk.

**Si algo sale mal en la ventana:** no se tocó nada en Plesk. Se vuelve a encender y listo.

## 6. Copias

| Qué | Dónde | Protege de |
|---|---|---|
| Copia automática de Vultr | Vultr, otro disco | Perder el servidor entero |
| `pg_dump` diario (14 días) | `/srv/proyectos/datos/respaldos` | Errores: algo borrado, una migración mala |
| **Fuera de Vultr** (pendiente) | R2 o Backblaze B2 con `rclone`, una vez al día | Perder la cuenta de Vultr |

La tercera se arma junto con el paso a almacenamiento de objetos
([16](16-ESPACIO-DE-ARCHIVOS.md)): es el mismo proveedor y la misma configuración de `rclone`.
Restaurar la base: `npm run respaldo:prod -- restaurar AAAA-MM-DD --confirmo` (igual que en Plesk).

## 7. Mantenimiento

- **Actualizaciones de seguridad:** automáticas (`unattended-upgrades`). Una vez al mes, entrar,
  correr `apt upgrade` y reiniciar si lo pide.
- **Disco:** `df -h /`. Si pasa del 70 %, toca el almacenamiento aparte o subir de plan.
- **Si la app se cae:** systemd la vuelve a levantar sola en 3 segundos. Para enterarse: Sentry
  (variables `SENTRY_DSN`) y un monitor gratis (UptimeRobot o el de Cloudflare) sobre
  `/api/v1/salud`.
