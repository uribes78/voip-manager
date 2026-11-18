/**
 * Tablas del esquema Realtime de Asterisk (contrib/ast-db-manage/config). NO se migran con Drizzle:
 * las instala Alembic. Aquí solo se declaran para consultarlas/escribirlas con tipos.
 * Las columnas "avanzadas" se declaran dinámicamente como varchar para permitir pass-through.
 */
import { mysqlTable, varchar, int, bigint, type MySqlColumnBuilderBase } from 'drizzle-orm/mysql-core';
import {
  PS_AOR_COLUMNS, PS_AUTH_COLUMNS, PS_ENDPOINT_COLUMNS, PS_IDENTIFY_COLUMNS, PS_REGISTRATION_COLUMNS,
} from '@voip-manager/shared';

const dyn = (cols: readonly string[], except: readonly string[] = []) =>
  Object.fromEntries(
    cols.filter((c) => !except.includes(c)).map((c) => [c, varchar(c, { length: 255 })]),
  ) as Record<string, MySqlColumnBuilderBase>;

export const psEndpoints = mysqlTable('ps_endpoints', {
  id: varchar('id', { length: 40 }).primaryKey(),
  transport: varchar('transport', { length: 40 }),
  aors: varchar('aors', { length: 200 }),
  auth: varchar('auth', { length: 40 }),
  context: varchar('context', { length: 40 }),
  disallow: varchar('disallow', { length: 200 }),
  allow: varchar('allow', { length: 200 }),
  callerid: varchar('callerid', { length: 40 }),
  outbound_auth: varchar('outbound_auth', { length: 40 }),
  ...dyn(PS_ENDPOINT_COLUMNS, ['transport', 'aors', 'auth', 'context', 'disallow', 'allow', 'callerid', 'outbound_auth']),
});

export const psAuths = mysqlTable('ps_auths', {
  id: varchar('id', { length: 40 }).primaryKey(),
  auth_type: varchar('auth_type', { length: 40 }),
  password: varchar('password', { length: 80 }),
  username: varchar('username', { length: 40 }),
  realm: varchar('realm', { length: 40 }),
  ...dyn(PS_AUTH_COLUMNS, ['auth_type', 'password', 'username', 'realm']),
});

export const psAors = mysqlTable('ps_aors', {
  id: varchar('id', { length: 40 }).primaryKey(),
  contact: varchar('contact', { length: 255 }),
  max_contacts: int('max_contacts'),
  qualify_frequency: int('qualify_frequency'),
  remove_existing: varchar('remove_existing', { length: 10 }),
  mailboxes: varchar('mailboxes', { length: 80 }),
  ...dyn(PS_AOR_COLUMNS, ['contact', 'max_contacts', 'qualify_frequency', 'remove_existing', 'mailboxes']),
});

export const psContacts = mysqlTable('ps_contacts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  uri: varchar('uri', { length: 511 }),
  expiration_time: bigint('expiration_time', { mode: 'number' }),
  user_agent: varchar('user_agent', { length: 255 }),
  endpoint: varchar('endpoint', { length: 40 }),
  via_addr: varchar('via_addr', { length: 40 }),
  via_port: int('via_port'),
  reg_server: varchar('reg_server', { length: 255 }),
});

export const psEndpointIdIps = mysqlTable('ps_endpoint_id_ips', {
  id: varchar('id', { length: 40 }).primaryKey(),
  endpoint: varchar('endpoint', { length: 40 }),
  match: varchar('match', { length: 80 }),
  ...dyn(PS_IDENTIFY_COLUMNS, ['endpoint', 'match']),
});

export const psRegistrations = mysqlTable('ps_registrations', {
  id: varchar('id', { length: 40 }).primaryKey(),
  client_uri: varchar('client_uri', { length: 255 }),
  server_uri: varchar('server_uri', { length: 255 }),
  outbound_auth: varchar('outbound_auth', { length: 40 }),
  endpoint: varchar('endpoint', { length: 40 }),
  transport: varchar('transport', { length: 40 }),
  ...dyn(PS_REGISTRATION_COLUMNS, ['client_uri', 'server_uri', 'outbound_auth', 'endpoint', 'transport']),
});
