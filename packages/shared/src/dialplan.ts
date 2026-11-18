import { z } from 'zod';

export const ContextName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo');

export const DialplanLineInput = z.object({
  context: ContextName,
  exten: z.string().trim().min(1).max(40).describe('Extensión o patrón, p.ej. _1XXX, s, h, i, t'),
  priority: z.number().int().min(1).max(9999),
  app: z.string().trim().min(1).max(40).describe('Aplicación de dialplan: Dial, Answer, Hangup, Goto...'),
  appdata: z.string().trim().max(256).default(''),
});
export type DialplanLineInput = z.infer<typeof DialplanLineInput>;

export const DialplanLine = DialplanLineInput.extend({ id: z.number().int() });
export type DialplanLine = z.infer<typeof DialplanLine>;

export const DialplanLineUpdateInput = DialplanLineInput.partial();
export type DialplanLineUpdateInput = z.infer<typeof DialplanLineUpdateInput>;

export const DialplanContext = z.object({
  context: z.string(),
  lines: z.number().int(),
  extens: z.number().int(),
});
export type DialplanContext = z.infer<typeof DialplanContext>;

/** Reemplaza (o agrega) todas las líneas de un contexto en una sola operación. */
export const DialplanBulkInput = z.object({
  context: ContextName,
  replace: z.boolean().default(false),
  lines: z
    .array(DialplanLineInput.omit({ context: true }))
    .min(1)
    .max(500)
    .refine(
      (lines) => new Set(lines.map((l) => `${l.exten}|${l.priority}`)).size === lines.length,
      'Hay combinaciones exten/priority duplicadas',
    ),
});
export type DialplanBulkInput = z.infer<typeof DialplanBulkInput>;

export const ContextParam = z.object({ context: ContextName });
