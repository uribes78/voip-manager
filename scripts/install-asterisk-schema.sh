#!/usr/bin/env bash
# Instala el esquema Realtime de Asterisk (tablas ps_*, queues, extensions, cdr...) con los Alembic oficiales.
# Uso:
#   scripts/install-asterisk-schema.sh                       # usa docker compose (perfil tools) contra el MariaDB del compose
#   DB_URL=mysql+pymysql://u:p@host:3306/asterisk scripts/install-asterisk-schema.sh   # contra otra base
#   ASTERISK_BRANCH=22 scripts/install-asterisk-schema.sh    # otra rama de Asterisk
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="${ASTERISK_BRANCH:-20}"
if [ -n "${DB_URL:-}" ]; then
  docker build --build-arg ASTERISK_BRANCH="$BRANCH" -t voip-manager/asterisk-schema:"$BRANCH" docker/alembic
  docker run --rm --network host -e DB_URL="$DB_URL" voip-manager/asterisk-schema:"$BRANCH"
else
  docker compose --profile tools build --build-arg ASTERISK_BRANCH="$BRANCH" asterisk-schema
  docker compose --profile tools run --rm asterisk-schema
fi
