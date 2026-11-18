#!/bin/sh
# Renderiza las plantillas de /etc/asterisk/custom (variables ${DB_*}, ${AMI_*}) sobre /etc/asterisk y /etc/odbc.ini
set -e
export DB_HOST="${DB_HOST:-mariadb}" DB_PORT="${DB_PORT:-3306}" DB_NAME="${DB_NAME:-asterisk}" \
       DB_USER="${DB_USER:-asterisk}" DB_PASSWORD="${DB_PASSWORD:-asterisk}" \
       AMI_USER="${AMI_USER:-voipmanager}" AMI_SECRET="${AMI_SECRET:-voipmanager}"
for f in /etc/asterisk/custom/*.conf; do
  envsubst '${DB_HOST} ${DB_PORT} ${DB_NAME} ${DB_USER} ${DB_PASSWORD} ${AMI_USER} ${AMI_SECRET}' < "$f" > "/etc/asterisk/$(basename "$f")"
done
envsubst '${DB_HOST} ${DB_PORT} ${DB_NAME}' < /etc/asterisk/custom/odbc.ini > /etc/odbc.ini
# El driver lo registra el paquete odbc-mariadb en /etc/odbcinst.ini como "MariaDB Unicode".
mkdir -p /var/log/asterisk /var/run/asterisk
chown -R asterisk:asterisk /var/log/asterisk /var/run/asterisk /var/lib/asterisk /var/spool/asterisk
exec asterisk -f -U asterisk -G asterisk -vvv
