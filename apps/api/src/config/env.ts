import { z } from 'zod';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Carga .env (raíz del monorepo o del paquete) con la API nativa de Node 24.
// Las rutas relativas del .env (logs, WEB_DIST) se resuelven respecto a la carpeta donde está el .env.
let envDir = process.cwd();
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
    } catch {
      /* ya cargado */
    }
    envDir = dirname(candidate);
    break;
  }
}
const pathFromEnv = z.string().transform((p) => resolve(envDir, p));

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const csv = z
  .string()
  .default('')
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ALLOWED_IPS: csv,
  CORS_ORIGIN: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().default('asterisk'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('asterisk'),

  AMI_HOST: z.string().default('127.0.0.1'),
  AMI_PORT: z.coerce.number().int().default(5038),
  AMI_USER: z.string().default('voipmanager'),
  AMI_SECRET: z.string().default(''),
  AMI_RECONNECT: boolish.default(true),

  ASTERISK_LOG_PATH: pathFromEnv.default('/var/log/asterisk/full'),
  SERVICE_LOG_PATH: pathFromEnv.optional(),
  ASTERISK_ETC_PATH: pathFromEnv.optional(),

  DEFAULT_CONTEXT: z.string().default('from-internal'),
  DEFAULT_TRANSPORT: z.string().default('transport-udp'),
  WEB_DIST: pathFromEnv.optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
