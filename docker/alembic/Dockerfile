# Ejecuta los Alembic oficiales de Asterisk (contrib/ast-db-manage) contra MariaDB.
FROM python:3.12-slim
ARG ASTERISK_BRANCH=20
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir "alembic>=1.13" "sqlalchemy>=2" pymysql cryptography
WORKDIR /opt
RUN git clone --depth 1 --branch ${ASTERISK_BRANCH} --filter=blob:none --sparse https://github.com/asterisk/asterisk.git \
 && cd asterisk && git sparse-checkout set contrib/ast-db-manage
WORKDIR /opt/asterisk/contrib/ast-db-manage
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
