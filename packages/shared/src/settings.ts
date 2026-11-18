import { z } from 'zod';

export const AsteriskConfigSnippet = z.object({
  file: z.string().describe('Nombre de archivo en /etc/asterisk o /etc'),
  content: z.string(),
  description: z.string(),
});
export type AsteriskConfigSnippet = z.infer<typeof AsteriskConfigSnippet>;

export const AsteriskConfigBundle = z.object({
  generatedAt: z.string().datetime(),
  snippets: z.array(AsteriskConfigSnippet),
});
export type AsteriskConfigBundle = z.infer<typeof AsteriskConfigBundle>;

export const AuditEntry = z.object({
  id: z.number().int(),
  userId: z.number().int().nullable(),
  username: z.string().nullable(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  details: z.unknown().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
