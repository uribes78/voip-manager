#!/bin/sh
# /etc/asterisk es un bind mount (docker/asterisk/etc) para que voip-manager pueda editar los archivos.
# 1) Si está vacío, se siembra con los archivos por defecto del paquete.
# 2) Las plantillas de /etc/asterisk/custom (variables ${DB_*}, ${AMI_*}) se renderizan solo si el archivo
#    destino no existe, para no pisar ediciones hechas desde la UI. FORCE_TEMPLATES=1 fuerza el re-render.
set -e
export DB_HOST="${DB_HOST:-mariadb}" DB_PORT="${DB_PORT:-3306}" DB_NAME="${DB_NAME:-asterisk}" \
       DB_USER="${DB_USER:-asterisk}" DB_PASSWORD="${DB_PASSWORD:-asterisk}" \
       AMI_USER="${AMI_USER:-voipmanager}" AMI_SECRET="${AMI_SECRET:-voipmanager}"
FIRST_BOOT=0
if [ -z "$(ls -A /etc/asterisk 2>/dev/null | grep -v '^custom$')" ]; then
  echo ">> /etc/asterisk vacío: copiando configuración por defecto del paquete"
  cp -a /etc/asterisk.dist/. /etc/asterisk/
  FIRST_BOOT=1
fi
for f in /etc/asterisk/custom/*.conf; do
  dest="/etc/asterisk/$(basename "$f")"
  if [ ! -f "$dest" ] || [ "$FIRST_BOOT" = "1" ] || [ "${FORCE_TEMPLATES:-0}" = "1" ]; then
    envsubst '${DB_HOST} ${DB_PORT} ${DB_NAME} ${DB_USER} ${DB_PASSWORD} ${AMI_USER} ${AMI_SECRET}' < "$f" > "$dest"
    echo ">> plantilla renderizada: $(basename "$f")"
  fi
done
envsubst '${DB_HOST} ${DB_PORT} ${DB_NAME}' < /etc/asterisk/custom/odbc.ini > /etc/odbc.ini
# Música en espera: /usr/share/asterisk/moh es un bind mount (docker/asterisk/moh); se siembra con los audios del paquete.
if [ -z "$(ls -A /usr/share/asterisk/moh 2>/dev/null)" ]; then
  echo ">> moh vacío: copiando audios por defecto del paquete"
  cp -a /usr/share/asterisk/moh.dist/. /usr/share/asterisk/moh/
fi
chown -R asterisk:asterisk /usr/share/asterisk/moh 2>/dev/null || true
chmod -R a+rX /usr/share/asterisk/moh 2>/dev/null || true
mkdir -p /var/log/asterisk /var/run/asterisk
chown -R asterisk:asterisk /var/log/asterisk /var/run/asterisk /var/lib/asterisk /var/spool/asterisk
# /etc/asterisk es un bind mount: el chown puede no aplicar; basta con que sea legible (custom/ es de solo lectura).
chown -R asterisk:asterisk /etc/asterisk 2>/dev/null || true
chmod -R a+rX /etc/asterisk 2>/dev/null || true
exec asterisk -f -U asterisk -G asterisk -vvv
