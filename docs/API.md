# Contrato de la API — voip-manager

Base URL: `/api/v1`. Todas las rutas (salvo `/auth/login`, `/auth/refresh` y `/health`) requieren
`Authorization: Bearer <accessToken>`. Los esquemas de entrada/salida viven en `@voip-manager/shared`
(zod) y son la fuente de verdad; aquí solo se listan rutas y el esquema que usan.

Errores: `ApiError { statusCode, error, message, details? }`. 401 token inválido/expirado, 403 sin permiso
(`Permission` = `<Resource>:<Action>`, ver `ROLE_PERMISSIONS`), 404 no encontrado, 409 conflicto (id duplicado),
422 validación (details = issues de zod), 502 Asterisk/AMI no disponible.

Listas paginadas: `Paginated<T> { items, total, page, pageSize }`, query `PaginationQuery { page, pageSize, search }`.

## Auth (`/auth`)
| Método | Ruta | Body | Respuesta | Permiso |
|---|---|---|---|---|
| POST | `/auth/login` | `LoginInput` | `TokenPair` | público |
| POST | `/auth/refresh` | `RefreshInput` | `TokenPair` | público |
| POST | `/auth/logout` | `RefreshInput` | `OkResponse` | autenticado |
| GET | `/auth/me` | — | `UserPublic` | autenticado |
| POST | `/auth/change-password` | `ChangePasswordInput` | `OkResponse` | autenticado |

## Usuarios (`/users`) — solo `users:*` (admin)
| GET | `/users` | `PaginationQuery` | `Paginated<UserPublic>` |
| POST | `/users` | `CreateUserInput` | `UserPublic` |
| GET | `/users/:id` | — | `UserPublic` |
| PATCH | `/users/:id` | `UpdateUserInput` | `UserPublic` |
| DELETE | `/users/:id` | — | `OkResponse` (desactiva, no borra) |

## Extensiones PJSIP (`/extensions`) — `extensions:read` / `extensions:write`
| GET | `/extensions` | `ExtensionListQuery` | `Paginated<ExtensionSummary>` (incluye `online`/`deviceState` si AMI está conectado) |
| POST | `/extensions` | `ExtensionCreateInput` | `Extension` (201) |
| GET | `/extensions/:id` | — | `Extension` |
| PATCH | `/extensions/:id` | `ExtensionUpdateInput` | `Extension` |
| DELETE | `/extensions/:id` | — | `OkResponse` (borra filas ps_*; conserva metadatos con `deletedAt` y snapshot) |
| POST | `/extensions/:id/clone` | `ExtensionCloneInput` | `Extension` (201) |
| POST | `/extensions/:id/restore` | — | `Extension` (recrea desde snapshot) |
| GET | `/extensions/:id/status` | — | `EndpointStatus` |

Escritura: cada alta/cambio/baja aplica `PJSIPNotify`/reload de PJSIP vía AMI cuando aplica (realtime lo hace
innecesario para endpoints, pero se dispara `module reload res_pjsip.so` tras cambios de transporte).

## Troncales (`/trunks`) — `trunks:read` / `trunks:write`
| GET | `/trunks` | `TrunkListQuery` | `Paginated<Trunk>` |
| POST | `/trunks` | `TrunkCreateInput` | `Trunk` (201) |
| GET | `/trunks/:id` | — | `Trunk` |
| PATCH | `/trunks/:id` | `TrunkUpdateInput` | `Trunk` |
| DELETE | `/trunks/:id` | — | `OkResponse` |
| POST | `/trunks/:id/restore` | — | `Trunk` |

## Colas (`/queues`) — `queues:read` / `queues:write`
| GET | `/queues` | `QueueListQuery` | `Paginated<Queue>` (sin `members`) |
| POST | `/queues` | `QueueCreateInput` | `Queue` (201) |
| GET | `/queues/:name` | — | `Queue` (con `members`) |
| PATCH | `/queues/:name` | `QueueUpdateInput` | `Queue` |
| DELETE | `/queues/:name` | — | `OkResponse` (borra cola y miembros) |
| GET | `/queues/:name/members` | — | `QueueMember[]` |
| POST | `/queues/:name/members` | `QueueMemberAddInput` | `QueueMember` (201). Solo extensiones no eliminadas. |
| PATCH | `/queues/:name/members/:uniqueid` | `QueueMemberUpdateInput` | `QueueMember` |
| DELETE | `/queues/:name/members/:uniqueid` | — | `OkResponse` |
| GET | `/queues/available-extensions?name=` | — | `ExtensionSummary[]` (activas y que no están ya en la cola) |

## Plan de marcado (`/dialplan`) — `dialplan:read` / `dialplan:write`
| GET | `/dialplan/contexts` | — | `DialplanContext[]` |
| GET | `/dialplan/contexts/:context` | — | `DialplanLine[]` (ordenadas por exten, priority) |
| DELETE | `/dialplan/contexts/:context` | — | `OkResponse` |
| POST | `/dialplan/lines` | `DialplanLineInput` | `DialplanLine` (201) |
| PATCH | `/dialplan/lines/:id` | `DialplanLineUpdateInput` | `DialplanLine` |
| DELETE | `/dialplan/lines/:id` | — | `OkResponse` |
| POST | `/dialplan/bulk` | `DialplanBulkInput` | `DialplanLine[]` |
| GET | `/dialplan/context-names` | — | `string[]` (nombres de contexto, para selects) |

## CDR (`/cdr`) — `cdr:read`
| GET | `/cdr` | `CdrQuery` | `Paginated<CdrRecord>` |
| GET | `/cdr/stats` | `CdrQuery` (sin paginación) | `CdrStats` |

## AMI (`/ami`) — `ami:read` / `ami:execute`
| GET | `/ami/status` | — | `AmiStatus` |
| GET | `/ami/dashboard` | — | `DashboardSnapshot` |
| GET | `/ami/endpoints` | — | `EndpointStatus[]` |
| POST | `/ami/refresh` | — | `DashboardSnapshot` (fuerza resincronización con Asterisk) |
| POST | `/ami/reload` | `ReloadInput` | `ReloadResult` (`ami:execute`) |
| POST | `/ami/originate` | `OriginateInput` | `OriginateResult` (`ami:execute`) |

WebSocket: `GET /ws/events?token=<accessToken>` → mensajes JSON `WsEvent`. Al conectar se envía un `snapshot`,
luego `endpoint`, `registration` y `ami` conforme cambian.

## Logs (`/logs`) — `logs:read`
| GET | `/logs` | `LogQuery` | `LogResult` |

## Configuración (`/settings`) — `settings:read`
| GET | `/settings/asterisk-config` | — | `AsteriskConfigBundle` (res_odbc.conf, extconfig.conf, sorcery.conf, cdr_adaptive_odbc.conf, odbc.ini, manager.conf, extensions.conf) |
| GET | `/settings/audit` | `PaginationQuery` | `Paginated<AuditEntry>` |

## Salud
| GET | `/health` | — | `{ status: 'ok'|'degraded', db, ami, schema: { config, cdr }, uptime, version }` |

Documentación OpenAPI generada: `GET /api/docs`.
