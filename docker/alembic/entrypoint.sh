#!/bin/sh
# DB_URL: mysql+pymysql://user:pass@host:3306/db
set -e
: "${DB_URL:?Define DB_URL (mysql+pymysql://user:pass@host:3306/db)}"
for ini in config cdr; do
  sed "s#^sqlalchemy.url.*#sqlalchemy.url = ${DB_URL}#" "${ini}.ini.sample" > "${ini}.ini"
  echo ">> alembic -c ${ini}.ini upgrade head"
  alembic -c "${ini}.ini" upgrade head
done
echo ">> Esquema realtime de Asterisk instalado/actualizado."
