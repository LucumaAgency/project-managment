#!/usr/bin/env bash
# Instala Lucuma Proyectos en un servidor nuevo de Vultr (Ubuntu 24.04), sin panel.
# Guía completa: documentacion/15-SERVIDOR-VULTR.md
#
# Uso (como root, en el servidor recién creado):
#   curl -fsSL https://raw.githubusercontent.com/LucumaAgency/project-managment/main/deploy/vultr/instalar.sh -o instalar.sh
#   DOMINIO=tudominio.com bash instalar.sh
#
# Se puede correr más de una vez: lo que ya existe (usuarios de la base, .env, clon) no se toca.
# Lo que NO hace (va a mano, ver la guía): el certificado de Cloudflare, la ACCESOS_CLAVE de la
# instalación anterior y la mudanza de datos.
set -euo pipefail

DOMINIO="${DOMINIO:?Falta DOMINIO, por ejemplo: DOMINIO=tudominio.com bash instalar.sh}"
REPO="${REPO:-https://github.com/LucumaAgency/project-managment.git}"
RAMA="${RAMA:-produccion}"          # la rama que arma CI con lo compilado (D-43)
BASE="/srv/proyectos"
APP="$BASE/app"                     # el clon de Git (no guardar nada a mano aquí)
DATOS="$BASE/datos"                 # archivos subidos y respaldos: fuera del clon
USUARIO="proyectos"                 # usuario del sistema que corre la app
PUERTO=3100

paso() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Correr como root."; exit 1; }
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || echo "Aviso: probado para Ubuntu 24.04 (este es ${PRETTY_NAME:-desconocido})."

paso "Sistema al día y paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q curl git ufw fail2ban unattended-upgrades nginx postgresql postgresql-contrib openssl logrotate

paso "Memoria de intercambio (2 GB): npm ci y prisma generate no caben en 2 GB de RAM solos"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null && echo 'vm.swappiness=10' > /etc/sysctl.d/90-swap.conf
fi

paso "Cortafuegos: solo SSH, 80 y 443 (el 3100 de la app queda cerrado al exterior)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades

paso "Node 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
node --version

paso "Usuario del sistema y carpetas"
id "$USUARIO" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$BASE" --shell /usr/sbin/nologin "$USUARIO"
mkdir -p "$DATOS/archivos" "$DATOS/respaldos"
chown -R "$USUARIO:$USUARIO" "$BASE"
chmod 750 "$BASE" "$DATOS"

paso "PostgreSQL: base lucuma_pm, dueño pm_admin, la app entra como pm_app (sujeto a RLS)"
# Los nombres terminan exactamente en pm_admin / pm_app: es lo que buscan las migraciones (D-45).
CLAVE_ADMIN=""; CLAVE_APP=""
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='pm_admin'" | grep -q 1; then
  CLAVE_ADMIN="$(openssl rand -hex 24)"   # solo letras y números: va dentro de una URL
  CLAVE_APP="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
CREATE ROLE pm_admin LOGIN PASSWORD '$CLAVE_ADMIN';
CREATE ROLE pm_app LOGIN PASSWORD '$CLAVE_APP';
CREATE DATABASE lucuma_pm OWNER pm_admin;
REVOKE ALL ON DATABASE lucuma_pm FROM PUBLIC;
GRANT CONNECT ON DATABASE lucuma_pm TO pm_admin, pm_app;
SQL
  echo "Usuarios de la base creados."
else
  echo "Los usuarios de la base ya existían: no se tocan."
fi

paso "Código (rama $RAMA, ya compilada por CI)"
if [ ! -d "$APP/.git" ]; then
  sudo -u "$USUARIO" git clone --branch "$RAMA" --depth 1 "$REPO" "$APP"
fi

paso ".env"
ENV="$APP/.env"
if [ ! -f "$ENV" ]; then
  [ -n "$CLAVE_ADMIN" ] || { echo "Hay usuarios de la base pero no .env: escribe $ENV a mano (ver .env.example)."; exit 1; }
  cat > "$ENV" <<EOF
NODE_ENV=production
PORT=$PUERTO
DATABASE_URL="postgresql://pm_app:$CLAVE_APP@127.0.0.1:5432/lucuma_pm"
DATABASE_ADMIN_URL="postgresql://pm_admin:$CLAVE_ADMIN@127.0.0.1:5432/lucuma_pm"
APP_URL="https://$DOMINIO"
# Cada agencia en <slug>.$DOMINIO (D-24).
BASE_DOMAIN=$DOMINIO
SESSION_SECRET="$(openssl rand -hex 32)"
CRON_TOKEN="$(openssl rand -hex 24)"
SOPORTE_BETA=1
ARCHIVOS_DIR="$DATOS/archivos"
ARCHIVOS_MAX_MB=50
RESPALDOS_DIR="$DATOS/respaldos"
# MUDANZA: pegar aquí la ACCESOS_CLAVE de la instalación anterior (la de Plesk). Si se pone
# una nueva, los accesos protegidos ya guardados no se pueden leer. Instalación desde cero:
# openssl rand -hex 32
ACCESOS_CLAVE=
# Correo (Brevo) y Sentry, cuando toque: ver .env.example
EOF
  chown "$USUARIO:$USUARIO" "$ENV"
  chmod 600 "$ENV"
  echo "Escrito $ENV (claves nuevas, generadas aquí; nunca salen del servidor)."
fi

paso "Dependencias, Prisma y migraciones"
cd "$APP"
sudo -u "$USUARIO" npm ci --omit=dev --no-audit --no-fund
sudo -u "$USUARIO" npx prisma generate
if [ "${MUDANZA:-0}" = 1 ]; then
  echo "MUDANZA=1: no se corren migraciones (la base llega con el respaldo; ver la guía)."
else
  sudo -u "$USUARIO" npx prisma migrate deploy
fi

paso "Servicio de la app (systemd)"
cat > /etc/systemd/system/proyectos.service <<EOF
[Unit]
Description=Lucuma Proyectos
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=$USUARIO
WorkingDirectory=$APP
ExecStart=/usr/bin/node packages/api/dist/server.js
Restart=always
RestartSec=3
# Tope de memoria: si la app se descontrola, se reinicia antes de tumbar a Postgres.
MemoryMax=900M
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# El latido: recordatorios, purga de papelera y respaldo diario (routes/cron.ts). En Plesk lo
# hacía cron-job.org desde afuera; aquí lo hace el propio servidor cada 15 minutos.
cat > /etc/systemd/system/proyectos-latido.service <<EOF
[Unit]
Description=Latido de Lucuma Proyectos (recordatorios, purga, respaldo)
After=proyectos.service

[Service]
Type=oneshot
User=$USUARIO
EnvironmentFile=$ENV
ExecStart=/bin/sh -c 'curl -fsS -m 300 -H "X-PM-Cron: \$CRON_TOKEN" http://127.0.0.1:$PUERTO/api/v1/cron/latido >/dev/null'
EOF
cat > /etc/systemd/system/proyectos-latido.timer <<EOF
[Unit]
Description=Latido de Lucuma Proyectos cada 15 minutos

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
EOF

cat > /etc/logrotate.d/proyectos <<EOF
$APP/logs/app.txt {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOF

systemctl daemon-reload
systemctl enable --now proyectos.service proyectos-latido.timer

paso "nginx"
if [ ! -f /etc/ssl/proyectos/origen.pem ]; then
  # Certificado provisorio para que nginx arranque. Reemplazar por el de Cloudflare (guía §3).
  mkdir -p /etc/ssl/proyectos
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=$DOMINIO" \
    -keyout /etc/ssl/proyectos/origen.key -out /etc/ssl/proyectos/origen.pem 2>/dev/null
  chmod 600 /etc/ssl/proyectos/origen.key
  echo "Certificado PROVISORIO: reemplazarlo por el de Cloudflare (guía §3)."
fi
# IPs de Cloudflare: para que la app vea la IP real de quien entra (auditoría, límites).
{
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $ip;"
  done
  echo "real_ip_header CF-Connecting-IP;"
} > /etc/nginx/conf.d/cloudflare-ip.conf
sed -e "s/__DOMINIO__/$DOMINIO/g" -e "s/__PUERTO__/$PUERTO/g" "$APP/deploy/vultr/nginx.conf" > /etc/nginx/sites-available/proyectos
ln -sf /etc/nginx/sites-available/proyectos /etc/nginx/sites-enabled/proyectos
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

paso "Revisión"
sleep 3
curl -fsS "http://127.0.0.1:$PUERTO/api/v1/salud" && echo
sudo -u "$USUARIO" node packages/api/dist/scripts/verificar-base.js || true

cat <<EOF

Listo. Falta, a mano (documentacion/15-SERVIDOR-VULTR.md):
  1. Certificado de origen de Cloudflare en /etc/ssl/proyectos/ y: systemctl reload nginx
  2. ACCESOS_CLAVE en $ENV (la de antes, si es mudanza) y: systemctl restart proyectos
  3. Copiar $ENV a un lugar seguro FUERA del servidor (gestor de contraseñas).
  4. Primera cuenta (si es instalación nueva):
       cd $APP && sudo -u $USUARIO npm run cuenta:crear:prod -- <slug> "<Agencia>" <correo> "<Nombre>"
EOF
