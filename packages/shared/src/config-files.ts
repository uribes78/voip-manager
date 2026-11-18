import { z } from 'zod';

export const ConfigFileName = z
  .string()
  .trim()
  .regex(/^[a-z0-9_.-]+\.conf$/i, 'Nombre de archivo inválido')
  .max(64);

export const ConfigBackend = z.enum(['fs', 'ami', 'none']);
export type ConfigBackend = z.infer<typeof ConfigBackend>;

export const ConfigFileInfo = z.object({
  file: z.string(),
  description: z.string(),
  reloadCommand: z.string().nullable().describe('Comando CLI para aplicar cambios; null = requiere reiniciar Asterisk'),
  backend: ConfigBackend,
  exists: z.boolean(),
  writable: z.boolean(),
  sizeBytes: z.number().int().nullable(),
  modifiedAt: z.string().datetime().nullable(),
  catalog: z.boolean().describe('true si es un archivo conocido por el servicio'),
});
export type ConfigFileInfo = z.infer<typeof ConfigFileInfo>;

export const ConfigFileContent = z.object({
  file: z.string(),
  backend: ConfigBackend,
  path: z.string().nullable(),
  content: z.string(),
  hash: z.string().describe('sha256 del contenido; se envía al guardar para detectar ediciones concurrentes'),
  commentsPreserved: z.boolean().describe('false con backend AMI: GetConfig no devuelve comentarios'),
  modifiedAt: z.string().datetime().nullable(),
  reloadCommand: z.string().nullable(),
});
export type ConfigFileContent = z.infer<typeof ConfigFileContent>;

export const ConfigFileWriteInput = z.object({
  content: z.string().max(512 * 1024),
  hash: z.string().optional().describe('hash leído previamente; 409 si el archivo cambió'),
  reload: z.boolean().default(true),
});
export type ConfigFileWriteInput = z.infer<typeof ConfigFileWriteInput>;

export const ConfigFileWriteResult = z.object({
  file: z.string(),
  backend: ConfigBackend,
  hash: z.string(),
  backupPath: z.string().nullable(),
  reload: z.object({ command: z.string(), response: z.string(), ok: z.boolean() }).nullable(),
  warnings: z.array(z.string()),
});
export type ConfigFileWriteResult = z.infer<typeof ConfigFileWriteResult>;

export const ConfigFileParam = z.object({ file: ConfigFileName });

export const FeatureCode = z.object({
  code: z.string().describe('Dígitos DTMF o extensión'),
  name: z.string(),
  source: z.enum(['featuremap', 'applicationmap', 'parking', 'dialplan']),
  description: z.string(),
  activateOn: z.string().nullable(),
  application: z.string().nullable(),
  context: z.string().nullable(),
});
export type FeatureCode = z.infer<typeof FeatureCode>;

export const ParkingLot = z.object({
  name: z.string(),
  parkext: z.string().nullable(),
  parkpos: z.string().nullable(),
  context: z.string().nullable(),
  parkingtime: z.string().nullable(),
});
export type ParkingLot = z.infer<typeof ParkingLot>;

export const FeaturesSummary = z.object({
  codes: z.array(FeatureCode),
  parkingLots: z.array(ParkingLot),
  general: z.record(z.string(), z.string()).describe('Opciones de [general] en features.conf'),
  sources: z.array(z.object({ file: z.string(), backend: ConfigBackend, exists: z.boolean() })),
});
export type FeaturesSummary = z.infer<typeof FeaturesSummary>;
