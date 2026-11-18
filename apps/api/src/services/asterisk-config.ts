import type { AsteriskConfigBundle, AsteriskConfigSnippet } from '@voip-manager/shared';
import type { Env } from '../config/env.js';

const REALTIME_TABLES = [
  'ps_endpoints', 'ps_auths', 'ps_aors', 'ps_domain_aliases', 'ps_contacts', 'ps_endpoint_id_ips',
  'ps_registrations', 'ps_transports', 'queues', 'queue_members', 'queue_rules', 'extensions', 'musiconhold',
];

/**
 * Genera los archivos de configuración que Asterisk necesita para leer este esquema por ODBC.
 * `contexts` son los contextos presentes en la tabla `extensions` (pbx_realtime exige declararlos).
 */
export function buildAsteriskConfig(env: Env, contexts: string[], odbcDsn = 'asterisk'): AsteriskConfigBundle {
  const dsn = odbcDsn;
  const snippets: AsteriskConfigSnippet[] = [
    {
      file: '/etc/odbc.ini',
      description: 'DSN de unixODBC hacia MariaDB (driver del paquete odbc-mariadb / MariaDB Connector/ODBC).',
      content: `[${dsn}]
Description = Asterisk realtime (voip-manager)
Driver      = MariaDB Unicode
Server      = ${env.DB_HOST}
Port        = ${env.DB_PORT}
Database    = ${env.DB_NAME}
Option      = 3
`,
    },
    {
      file: '/etc/asterisk/res_odbc.conf',
      description: 'Conexión ODBC que usan res_config_odbc y cdr_adaptive_odbc.',
      content: `[${dsn}]
enabled         => yes
dsn             => ${dsn}
username        => ${env.DB_USER}
password        => ${env.DB_PASSWORD}
pre-connect     => yes
max_connections => 10
connect_timeout => 10
negative_connection_cache => 60
`,
    },
    {
      file: '/etc/asterisk/extconfig.conf',
      description: 'Mapea cada familia realtime a la tabla en ODBC.',
      content: `[settings]
${REALTIME_TABLES.map((t) => `${t} => odbc,${dsn},${t}`).join('\n')}
`,
    },
    {
      file: '/etc/asterisk/sorcery.conf',
      description: 'Indica a res_pjsip que lea endpoints, auths, aors, contactos, identificación por IP y registros desde realtime.',
      content: `[res_pjsip]
endpoint=realtime,ps_endpoints
auth=realtime,ps_auths
aor=realtime,ps_aors
domain_alias=realtime,ps_domain_aliases
contact=realtime,ps_contacts

[res_pjsip_endpoint_identifier_ip]
identify=realtime,ps_endpoint_id_ips

[res_pjsip_outbound_registration]
registration=realtime,ps_registrations
`,
    },
    {
      file: '/etc/asterisk/pjsip.conf',
      description: 'Transportes estáticos. Los endpoints viven en la base de datos.',
      content: `[global]
type=global
user_agent=Asterisk voip-manager
endpoint_identifier_order=ip,username,anonymous

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
; external_media_address=IP.PUBLICA
; external_signaling_address=IP.PUBLICA
; local_net=192.168.0.0/16

[transport-tcp]
type=transport
protocol=tcp
bind=0.0.0.0:5060

[transport-wss]
type=transport
protocol=wss
bind=0.0.0.0:8089
`,
    },
    {
      file: '/etc/asterisk/extensions.conf',
      description:
        'pbx_realtime exige declarar cada contexto con un switch. Vuelve a generar este archivo y ejecuta "dialplan reload" al crear contextos nuevos.',
      content: `[general]
static=yes
writeprotect=yes
clearglobalvars=no

${(contexts.length ? contexts : [env.DEFAULT_CONTEXT, 'from-trunk'])
  .map((c) => `[${c}]\nswitch => Realtime/${c}@extensions`)
  .join('\n\n')}
`,
    },
    {
      file: '/etc/asterisk/cdr_adaptive_odbc.conf',
      description: 'Guarda el CDR en la tabla `cdr` (esquema cdr.ini de Alembic).',
      content: `[${dsn}]
connection=${dsn}
table=cdr
`,
    },
    {
      file: '/etc/asterisk/cdr.conf',
      description: 'Habilita CDR.',
      content: `[general]
enable=yes
unanswered=yes
congestion=yes
endbeforehexten=yes
initiatedseconds=yes
batch=no
`,
    },
    {
      file: '/etc/asterisk/queues.conf',
      description: 'Las colas se leen de realtime; aquí solo opciones generales.',
      content: `[general]
persistentmembers=yes
autofill=yes
monitor-type=MixMonitor
shared_lastcall=yes
log_membername_as_agent=yes
`,
    },
    {
      file: '/etc/asterisk/manager.conf',
      description: 'Usuario AMI que usa voip-manager. Restringe `permit` a la IP del servicio.',
      content: `[general]
enabled=yes
port=${env.AMI_PORT}
bindaddr=0.0.0.0
displayconnects=no

[${env.AMI_USER}]
secret=${env.AMI_SECRET || 'CAMBIAR'}
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
permit=10.0.0.0/255.0.0.0
permit=172.16.0.0/255.240.0.0
permit=192.168.0.0/255.255.0.0
read=system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write=system,call,command,agent,user,config,originate,reporting
eventfilter=!Event: RTCP*
eventfilter=!Event: VarSet
`,
    },
    {
      file: '/etc/asterisk/modules.conf',
      description: 'Precarga ODBC antes de los módulos que dependen de realtime.',
      content: `[modules]
autoload=yes
preload => res_odbc.so
preload => res_config_odbc.so
noload => chan_sip.so
noload => cdr_csv.so
noload => cdr_custom.so
noload => cel_custom.so
`,
    },
    {
      file: '/etc/asterisk/logger.conf',
      description: 'Log completo que lee la pestaña Logs del servicio.',
      content: `[general]
dateformat=%F %T
appendhostname=no

[logfiles]
console => notice,warning,error
full => notice,warning,error,verbose,dtmf,fax,security
`,
    },
  ];
  return { generatedAt: new Date().toISOString(), snippets };
}
