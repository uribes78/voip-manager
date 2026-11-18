# Asterisk 20 LTS (paquetes Ubuntu 24.04; Debian 12/13 ya no empaquetan asterisk) + unixODBC + MariaDB Connector/ODBC.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      asterisk asterisk-modules asterisk-config asterisk-core-sounds-en-gsm asterisk-moh-opsound-gsm \
      unixodbc odbc-mariadb gettext-base ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mv /etc/asterisk /etc/asterisk.dist && mkdir -p /etc/asterisk \
 && mv /usr/share/asterisk/moh /usr/share/asterisk/moh.dist && mkdir -p /usr/share/asterisk/moh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 5038 5060/udp 5060/tcp 8089
ENTRYPOINT ["/entrypoint.sh"]
