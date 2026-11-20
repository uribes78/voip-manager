# Despliegue en un solo servidor

Guía para instalar voip-manager completo (MariaDB, Asterisk 20, API/web y proxy HTTPS) en una máquina virtual
Ubuntu 22.04/24.04 o Debian 12 (Proxmox, VMware o similar). Todo corre en Docker a partir de las imágenes que
publica el workflow de GitHub Actions en GHCR.

## Requisitos de la VM

| Recurso | Mínimo recomendado |
|---|---|
| CPU / RAM | 2 vCPU, 4 GB |
| Disco | 20 GB (más espacio si grabas llamadas o conservas CDR por años) |
| Red | IP fija en la LAN. Si habrá teléfonos o carriers por Internet, NAT 1:1 o puertos 5060/udp y 10000-20000/udp |
| Sistema | Ubuntu 22.04/24.04 o Debian 12, acceso root por SSH |

Las imágenes se publican para `linux/amd64`; las VMs x86 son el caso normal.

## Instalación

```bash
sudo mkdir -p /opt/voip-manager && cd /opt/voip-manager
# copia la carpeta deploy/ del repositorio (scp, git clone, o descarga el zip de la release)
sudo curl -fsSL https://github.com/uribes78/voip-manager/archive/refs/heads/main.tar.gz | sudo tar xz --strip-components=2 voip-manager-main/deploy
sudo ./install.sh
```

`install.sh` instala Docker si falta, crea `.env` con contraseñas aleatorias, descarga las imágenes, instala el esquema
Realtime de Asterisk (Alembic), aplica las migraciones del servicio, crea el usuario `admin` y levanta todo. Al
terminar muestra la URL y la contraseña inicial (`SEED_ADMIN_PASSWORD` en `.env`).

Antes de ejecutarlo, o editando `.env` después, decide:

- `DOMAIN`: nombre o IP con el que entrarán a la web.
- `TLS_MODE=internal` (certificado propio de Caddy, válido para IP o nombres internos; el navegador avisará una vez
  salvo que instales la CA que queda en `data/caddy/data/caddy/pki/authorities/local/root.crt`) o
  `TLS_MODE=auto` si el dominio es público y los puertos 80/443 están abiertos (Let's Encrypt).
- `ALLOWED_IPS`: redes desde las que se permite usar la API.

HTTPS no es opcional: la escucha en vivo usa WebAudio y WebSockets, que el navegador solo habilita en origen seguro
(o en `localhost`).

## Cómo queda armado

```
Internet/LAN ──443──► caddy ──► api:3000 (Fastify + web)
                                 │  mysql2            └── /data/asterisk/{etc,moh,log}  (bind mounts compartidos)
                                 ▼
                              mariadb  ◄── ODBC (127.0.0.1:3306) ── asterisk (network_mode: host)
                                                 AMI 127.0.0.1:5038 ◄── api (host.docker.internal)
                                                 app_audiofork ──► ws://127.0.0.1:3000/ws/audiofork/… (api)
```

- Asterisk usa la red del host: SIP 5060, RTP 10000-20000 y AMI 5038 quedan en la IP de la VM. La API y MariaDB
  solo se publican en `127.0.0.1`; Caddy es lo único expuesto.
- `/etc/asterisk`, la música en espera y los logs viven en `DATA_DIR/asterisk` y los ven ambos contenedores, por eso el
  editor de archivos, los hints BLF y la subida de audios funcionan con el backend de archivo.
- Las plantillas de `deploy/asterisk-templates` se copian a `/etc/asterisk` solo en el primer arranque (o con
  `FORCE_TEMPLATES=1`); después se administran desde la web.

## Firewall

Abre solo lo necesario (ejemplo con ufw):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp                      # solo si TLS_MODE=auto
sudo ufw allow 5060/udp && sudo ufw allow 5060/tcp
sudo ufw allow 10000:20000/udp
sudo ufw enable
```

AMI (5038) y MariaDB (3306) no deben abrirse; AMI además solo acepta conexiones desde `127.0.0.1` y la red de Docker
(`manager.conf`). Si usas WebRTC, abre también 8089/tcp.

## Operación

```bash
cd /opt/voip-manager
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api asterisk
docker compose -f docker-compose.prod.yml exec asterisk asterisk -rvvv      # consola de Asterisk
sudo ./install.sh --update                                                   # actualizar a las imágenes nuevas
```

Para fijar una versión en lugar de `latest`, cambia `IMAGE_API`, `IMAGE_ASTERISK` e `IMAGE_SCHEMA` en `.env` a una
etiqueta publicada (por ejemplo `v0.1.0` al crear un tag `v0.1.0` en GitHub).

### Respaldos

Lo que hay que respaldar está todo en `DATA_DIR`:

```bash
docker compose -f docker-compose.prod.yml exec -T mariadb mariadb-dump -uroot -p"$DB_ROOT_PASSWORD" --single-transaction asterisk > backup-$(date +%F).sql
tar czf asterisk-data-$(date +%F).tgz -C "$DATA_DIR" asterisk
```

### Sin Docker para Asterisk

Si prefieres Asterisk instalado nativamente en la VM (por ejemplo para usar hardware DAHDI), quita el servicio
`asterisk` del compose, copia a `/etc/asterisk` los archivos que genera **Configuración → Plantillas generadas**,
instala unixODBC + MariaDB Connector/ODBC, compila `app_audiofork` contra tus fuentes y apunta `ASTERISK_ETC_PATH`,
`ASTERISK_MOH_PATH` y `ASTERISK_LOG_PATH` de la API a las rutas reales (montadas en el contenedor de la API).

## CI/CD

`.github/workflows/ci.yml` ejecuta en cada push y pull request: `npm ci`, typecheck, pruebas y build, y valida el
compose de producción. En push a `main` o a un tag `v*` construye y publica las tres imágenes en GHCR:
`voip-manager-api`, `voip-manager-asterisk` y `voip-manager-schema`, con etiquetas `latest`, `main`, el SHA y la
versión del tag.

La primera vez que se publiquen, los paquetes quedan privados en GHCR. Para que `install.sh` pueda descargarlos sin
credenciales, hazlos públicos en GitHub → Packages → cada paquete → Package settings → Change visibility, o usa
`docker login ghcr.io` con un token de solo lectura en el servidor.
