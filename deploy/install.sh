#!/usr/bin/env bash
# Instalación / actualización de voip-manager en un solo servidor (Ubuntu 22.04/24.04 o Debian 12).
#   sudo ./install.sh            # instala o actualiza
#   sudo ./install.sh --update   # solo descarga imágenes nuevas y reinicia
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

msg() { printf '\n\033[1;32m>> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "Ejecuta como root (sudo)."

if ! command -v docker >/dev/null 2>&1; then
  msg "Instalando Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Falta el plugin docker compose (apt install docker-compose-plugin)."

if [ ! -f .env ]; then
  msg "Creando .env a partir de .env.production.example"
  cp .env.production.example .env
  rand() { openssl rand -base64 32 | tr -d '/+=' | cut -c1-"$1"; }
  sed -i "s#^DB_PASSWORD=.*#DB_PASSWORD=$(rand 24)#; s#^DB_ROOT_PASSWORD=.*#DB_ROOT_PASSWORD=$(rand 24)#; s#^AMI_SECRET=.*#AMI_SECRET=$(rand 24)#; s#^JWT_SECRET=.*#JWT_SECRET=$(rand 48)#; s#^SEED_ADMIN_PASSWORD=.*#SEED_ADMIN_PASSWORD=$(rand 12)#" .env
  sed -i "s#^DATA_DIR=.*#DATA_DIR=$(pwd)/data#" .env
  chmod 600 .env
  echo "   Revisa DOMAIN y TLS_MODE en $(pwd)/.env antes de continuar." 
fi
set -a; . ./.env; set +a
[ "${DB_PASSWORD}" != "CAMBIAR" ] || die "Define DB_PASSWORD en .env"

mkdir -p "${DATA_DIR}"/{mariadb,caddy/data,caddy/config} "${DATA_DIR}"/asterisk/{etc,moh,log,spool,lib}
# El usuario asterisk dentro del contenedor necesita escribir en estas carpetas.
chmod -R a+rwX "${DATA_DIR}/asterisk"

msg "Descargando imágenes"
$COMPOSE pull

if [ "${1:-}" = "--update" ]; then
  msg "Reiniciando servicios con las imágenes nuevas"
  $COMPOSE up -d --remove-orphans
  msg "Aplicando migraciones del servicio"
  $COMPOSE exec -T api node dist/db/migrate.js
  $COMPOSE --profile tools run --rm schema
  exit 0
fi

msg "Iniciando MariaDB"
$COMPOSE up -d mariadb
msg "Instalando esquema Realtime de Asterisk (Alembic)"
$COMPOSE --profile tools run --rm schema
msg "Iniciando API (migraciones y usuario inicial)"
$COMPOSE up -d api
sleep 5
$COMPOSE exec -T api node dist/db/migrate.js
$COMPOSE exec -T -e SEED_ADMIN_USER="${SEED_ADMIN_USER:-admin}" -e SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD}" api node dist/db/seed.js
msg "Iniciando Asterisk y el proxy HTTPS"
$COMPOSE up -d asterisk caddy
$COMPOSE ps
cat <<MSG

Listo. Abre https://${DOMAIN}  (usuario ${SEED_ADMIN_USER:-admin} / contraseña en .env: SEED_ADMIN_PASSWORD)
- Cambia la contraseña del administrador al entrar.
- Puertos SIP: 5060/udp y tcp, RTP 10000-10100/udp (ajusta rtp.conf y el firewall si necesitas más llamadas).
- Logs: docker compose -f docker-compose.prod.yml logs -f api asterisk
MSG
