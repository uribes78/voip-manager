# voip-manager

Servicio para administrar una instancia de **Asterisk 18+** mediante el esquema **Realtime** (ODBC → MariaDB):
extensiones PJSIP, troncales, colas, plan de marcado, CDR, monitoreo por AMI y lectura de logs.
PRD en `docs/PRD_Requirements.md`; contrato de la API en `docs/API.md`.

## Stack

| Capa | Tecnología |
|---|---|
| API | Node 24, Fastify 5, zod 4 (`fastify-type-provider-zod`), Drizzle ORM (mysql2), `asterisk-manager`, `ip-range-check`, JWT (`@fastify/jwt`), argon2 |
| Web | Vue 3, Vite, TypeScript, Tailwind v4, shadcn-vue, Pinia, vue-router, TanStack Query |
| Esquema Asterisk | Alembic oficial (`contrib/ast-db-manage`) para `ps_*`, `queues`, `extensions`, `cdr` |
| Esquema propio | Drizzle (tablas `vm_*`: usuarios, tokens, metadatos de endpoints/colas, auditoría) |
| Asterisk → BD | unixODBC + MariaDB Connector/ODBC (`res_odbc`, `res_config_odbc`, `cdr_adaptive_odbc`) |

```
apps/api         Fastify (sirve también el build del frontend en producción)
apps/web         Vue 3 + shadcn-vue
packages/shared  Esquemas zod y tipos compartidos (fuente de verdad del contrato)
docker/          MariaDB, Asterisk 20 (Ubuntu 24.04) y la imagen que ejecuta los Alembic de Asterisk
scripts/         install-asterisk-schema.sh
```

## Puesta en marcha (desarrollo)

Requisitos: Node 24 (`nvm use`), Docker.

```bash
npm install
cp .env.example .env            # ajusta JWT_SECRET, DB_*, AMI_*

docker compose up -d mariadb
npm run asterisk:schema         # Alembic de Asterisk → tablas realtime (ps_*, queues, extensions, cdr)
npm run db:migrate              # tablas vm_* (Drizzle)
npm run db:seed                 # usuario admin / Admin.1234  (SEED_ADMIN_USER / SEED_ADMIN_PASSWORD)
docker compose up -d asterisk   # Asterisk 20 leyendo la BD por ODBC, AMI en :5038

npm run dev                     # shared (tsc --watch) + API :3000 (docs en /api/docs) + web :5173 en paralelo.
                                # Si 5173 está ocupado, Vite toma el siguiente libre: usa la URL que imprime en consola.
```

Flujo típico: crear extensiones en la UI → registrar un softphone contra `localhost:5060` con usuario/secret de la
extensión → ver estado en el Dashboard → probar con "Probar llamada" (Originate) → revisar CDR y Logs.

## Cómo se mapea cada objeto a Realtime

| Objeto | Tablas | Notas |
|---|---|---|
| Extensión | `ps_endpoints`, `ps_aors`, `ps_auths` (mismo `id` = número) | Campos frecuentes en el formulario; cualquier otra columna en "Avanzado" |
| Troncal | `ps_endpoints`, `ps_aors`, `ps_endpoint_id_ips`, y si usa credenciales `ps_auths` (+ `ps_registrations` si registra) | Se distingue con `vm_endpoint_meta.type = 'trunk'` |
| Cola | `queues`, `queue_members` (`interface = PJSIP/<ext>`) | Solo extensiones no eliminadas pueden ser miembros |
| Dialplan | `extensions` (`context, exten, priority, app, appdata`) | pbx_realtime exige declarar cada contexto en `extensions.conf` con `switch => Realtime/<ctx>@extensions`; el servicio genera ese snippet en Configuración |
| CDR | `cdr` | `cdr_adaptive_odbc` |

### Features (códigos de función) y archivos sin soporte Realtime

`features.conf` (featuremap, applicationmap, pickupexten) y `res_parking.conf` no tienen soporte Realtime en
Asterisk. La pestaña **Configuración → Archivos de Asterisk** los edita como texto con resaltado y los aplica
con el comando de recarga correspondiente (`module reload features`, `module reload res_parking.so`, ...):

- Backend `fs`: si `ASTERISK_ETC_PATH` apunta a `/etc/asterisk` (mismo host, carpeta compartida o el bind mount
  `docker/asterisk/etc` del compose). Conserva comentarios y guarda respaldos en `.voip-manager-backups/`.
- Backend `ami`: si no hay acceso a la carpeta, usa `GetConfig`/`UpdateConfig` por AMI. Funciona en remoto, pero
  Asterisk no devuelve comentarios, así que se pierden al guardar.

La pestaña **Códigos de función** resume lo definido en ambos archivos y las extensiones `Pickup`/`Park` del dialplan.

### Música en espera

Las clases viven en la tabla realtime `musiconhold` (+ `musiconhold_entry` para playlists); Asterisk las carga al
primer uso o con `moh reload`. La página **Música en espera** las administra y sube audios al directorio de cada
clase:

- `directory` es relativo al `astdatadir` de Asterisk (`moh/<clase>` por defecto) o absoluto. Para que el servicio
  pueda escribir ahí, el directorio debe estar mapeado: `ASTERISK_MOH_PATH` (ruta local de `<astdatadir>/moh`) o
  `ASTERISK_PATH_MAP=/ruta/en/asterisk=/ruta/local,...` para carpetas personalizadas. Sin mapeo la clase se puede
  definir, pero los audios hay que copiarlos por otro medio.
- Los WAV se convierten a 8 kHz mono 16 bits (conversor propio). Con `ffmpeg` disponible (`FFMPEG_PATH` o en PATH)
  también se aceptan MP3/OGG/M4A/FLAC. GSM, µ-law, A-law y SLN se guardan tal cual.
- La previsualización en el navegador funciona para WAV, µ-law, A-law y SLN.

Eliminar una extensión/troncal borra sus filas `ps_*` (deja de autenticar de inmediato) y conserva la configuración en
`vm_endpoint_meta.snapshot` para poder restaurarla.

## Producción

```bash
npm run build                       # shared → api → web
NODE_ENV=production node apps/api/dist/index.js   # sirve /api y el frontend desde apps/web/dist
```

Para que Asterisk lea la BD: copia los archivos que genera `GET /api/v1/settings/asterisk-config` (también visibles
en la pestaña Configuración) a `/etc/asterisk` y `/etc/odbc.ini` del servidor Asterisk. Instala el esquema con
`DB_URL=mysql+pymysql://user:pass@host:3306/asterisk scripts/install-asterisk-schema.sh` (requiere Docker) o
directamente con `alembic` desde `contrib/ast-db-manage` del código fuente de Asterisk.

## Roles

| Rol | Permisos |
|---|---|
| `admin` | Todo, incluida la gestión de usuarios |
| `operator` | Lectura/escritura de extensiones, troncales, colas y dialplan; lectura de CDR/logs; reload y originate |
| `viewer` | Solo lectura (sin usuarios) |

El acceso a la API se limita además por `ALLOWED_IPS` (CIDR, `ip-range-check`).
