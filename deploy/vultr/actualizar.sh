#!/usr/bin/env bash
# Despliega la última versión en el servidor de Vultr: lo mismo que Git → Desplegar →
# prisma:generate → prisma:deploy → Reiniciar en Plesk, en un solo comando.
#
#   sudo bash /srv/proyectos/app/deploy/vultr/actualizar.sh
#
# Sale en el primer error (si falla una migración, la app vieja sigue corriendo).
set -euo pipefail
APP="/srv/proyectos/app"
USUARIO="proyectos"
cd "$APP"

antes="$(sudo -u "$USUARIO" git rev-parse --short HEAD)"
sudo -u "$USUARIO" git fetch --depth 1 origin produccion
sudo -u "$USUARIO" git reset --hard origin/produccion   # el .env y logs/ no están en Git: no se tocan
ahora="$(sudo -u "$USUARIO" git rev-parse --short HEAD)"
echo "Versión: $antes → $ahora"

sudo -u "$USUARIO" npm ci --omit=dev --no-audit --no-fund
sudo -u "$USUARIO" npx prisma generate
sudo -u "$USUARIO" npx prisma migrate deploy
sudo -u "$USUARIO" node packages/api/dist/scripts/verificar-base.js
systemctl restart proyectos
sleep 3
curl -fsS http://127.0.0.1:3100/api/v1/salud && echo
