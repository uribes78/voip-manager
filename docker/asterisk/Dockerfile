# Asterisk 20 LTS (paquetes Ubuntu 24.04; Debian 12/13 ya no empaquetan asterisk) + unixODBC + MariaDB Connector/ODBC.
FROM ubuntu:24.04 AS audiofork
# Compila app_audiofork (https://github.com/hosseinhunta/asterisk-audiofork) contra los headers del paquete asterisk-dev.
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends asterisk-dev build-essential git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/hosseinhunta/asterisk-audiofork.git . \
 # Parches: la rama publicada tiene una llave de cierre faltante en audiofork_ws_connect() y pasa
 # `struct ast_str *` donde json_append_string() espera `struct ast_str **` (metadatos con opción M).
 && perl -0pi -e 's/\treturn result;\n\n\/\*\n \* Sleep \(interruptibly\)/\treturn result;\n}\n\n\/*\n * Sleep (interruptibly)/' app_audiofork.c \
 && sed -i 's/json_append_string(buf, /json_append_string(\&buf, /g' app_audiofork.c \
 && gcc -shared -fPIC -O2 -Wall -D_REENTRANT -D_GNU_SOURCE -DAST_MODULE_SELF_SYM=__internal_app_audiofork_self \
      -I/usr/include app_audiofork.c -o app_audiofork.so \
 && ls -la app_audiofork.so

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      asterisk asterisk-modules asterisk-config asterisk-core-sounds-en-gsm asterisk-moh-opsound-gsm \
      unixodbc odbc-mariadb gettext-base ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mv /etc/asterisk /etc/asterisk.dist && mkdir -p /etc/asterisk \
 && mv /usr/share/asterisk/moh /usr/share/asterisk/moh.dist && mkdir -p /usr/share/asterisk/moh
# Módulo de escucha en vivo (AudioFork → WebSocket)
COPY --from=audiofork /src/app_audiofork.so /tmp/app_audiofork.so
RUN mv /tmp/app_audiofork.so "$(dirname "$(find /usr/lib -name app_dial.so | head -1)")/" 
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 5038 5060/udp 5060/tcp 8089
ENTRYPOINT ["/entrypoint.sh"]
