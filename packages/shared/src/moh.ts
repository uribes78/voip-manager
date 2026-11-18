import { z } from 'zod';
import { partialWithoutDefaults } from './common.js';

export const MohClassName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, guion y guion bajo');

export const MohMode = z.enum(['files', 'playlist', 'custom']);
export type MohMode = z.infer<typeof MohMode>;

export const MohSort = z.enum(['alpha', 'random', 'randstart']);

/** Directorio: relativo a astdatadir de Asterisk (p.ej. "moh/ventas") o absoluto (p.ej. /srv/moh/ventas). */
export const MohDirectory = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^(\/[A-Za-z0-9_.\/-]+|[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*)$/, 'Ruta inválida')
  .refine((d) => !d.split('/').includes('..'), 'La ruta no puede contener ..');

export const MohClassBase = z.object({
  name: MohClassName,
  mode: MohMode.default('files'),
  directory: MohDirectory.optional().describe('Relativo al astdatadir de Asterisk (moh/<clase> por defecto) o absoluto'),
  sort: MohSort.default('alpha'),
  digit: z.string().trim().max(1).optional().describe('Dígito para seleccionar la clase durante la espera'),
  application: z.string().trim().max(255).optional().describe('Comando externo en modo custom'),
  format: z.string().trim().max(10).optional().describe('Formato que entrega el comando en modo custom'),
  loopLast: z.boolean().default(false),
  entries: z.array(z.string().trim().min(1).max(1024)).default([]).describe('URLs/rutas para modo playlist'),
});

export const MohClassCreateInput = MohClassBase;
export type MohClassCreateInput = z.infer<typeof MohClassCreateInput>;
export type MohClassForm = z.input<typeof MohClassBase>;

export const MohClassUpdateInput = partialWithoutDefaults(MohClassBase.omit({ name: true }));
export type MohClassUpdateInput = z.infer<typeof MohClassUpdateInput>;

export const MohDirectoryInfo = z.object({
  asteriskPath: z.string().describe('Ruta tal como la ve Asterisk'),
  localPath: z.string().nullable().describe('Ruta local equivalente para el servicio, si hay mapeo'),
  accessible: z.boolean(),
  exists: z.boolean(),
  writable: z.boolean(),
});
export type MohDirectoryInfo = z.infer<typeof MohDirectoryInfo>;

export const MohClass = MohClassBase.extend({
  directory: MohDirectory,
  source: z.enum(['realtime', 'static']).describe('static = definida en musiconhold.conf'),
  directoryInfo: MohDirectoryInfo,
  fileCount: z.number().int().nullable(),
  stamp: z.string().datetime().nullable(),
  loaded: z.boolean().optional().describe('Asterisk la tiene cargada (moh show classes)'),
});
export type MohClass = z.infer<typeof MohClass>;

export const MohFile = z.object({
  name: z.string(),
  format: z.string(),
  sizeBytes: z.number().int(),
  modifiedAt: z.string().datetime(),
  durationSec: z.number().nullable(),
  playable: z.boolean().describe('Asterisk puede reproducirlo (wav/gsm/ulaw/alaw/sln/g722)'),
  previewable: z.boolean().describe('El navegador puede reproducirlo (wav)'),
});
export type MohFile = z.infer<typeof MohFile>;

export const MohUploadResult = z.object({
  files: z.array(
    z.object({
      original: z.string(),
      stored: z.string().nullable(),
      converted: z.boolean(),
      converter: z.enum(['ffmpeg', 'builtin', 'none']),
      error: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type MohUploadResult = z.infer<typeof MohUploadResult>;

export const MohEnvironment = z.object({
  mohPath: z.string().nullable().describe('Ruta local equivalente a <astdatadir>/moh'),
  dataRemotePath: z.string().describe('astdatadir en el servidor Asterisk (base de los directorios relativos)'),
  mohRemotePath: z.string().describe('<astdatadir>/moh en el servidor Asterisk'),
  pathMap: z.array(z.object({ remote: z.string(), local: z.string() })),
  ffmpeg: z.boolean(),
  nativeFormats: z.array(z.string()),
});
export type MohEnvironment = z.infer<typeof MohEnvironment>;

export const MohClassParam = z.object({ name: MohClassName });
export const MohFileParam = MohClassParam.extend({
  file: z.string().trim().min(1).max(255).regex(/^[^/\\]+$/, 'Nombre de archivo inválido'),
});
export const MohDeleteQuery = z.object({ deleteFiles: z.coerce.boolean().default(false) });
