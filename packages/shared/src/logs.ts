import { z } from 'zod';

export const LogSource = z.enum(['asterisk', 'service']);
export type LogSource = z.infer<typeof LogSource>;

export const LogLevel = z.enum(['ERROR', 'WARNING', 'NOTICE', 'VERBOSE', 'DEBUG', 'DTMF', 'SECURITY']);
export type LogLevel = z.infer<typeof LogLevel>;

export const LogQuery = z.object({
  source: LogSource.default('asterisk'),
  lines: z.coerce.number().int().min(10).max(5000).default(300),
  grep: z.string().trim().max(200).optional(),
  level: LogLevel.optional(),
});
export type LogQuery = z.infer<typeof LogQuery>;

export const LogLine = z.object({
  raw: z.string(),
  timestamp: z.string().nullable(),
  level: z.string().nullable(),
  module: z.string().nullable(),
  message: z.string(),
});
export type LogLine = z.infer<typeof LogLine>;

export const LogResult = z.object({
  source: LogSource,
  path: z.string(),
  exists: z.boolean(),
  sizeBytes: z.number().int(),
  lines: z.array(LogLine),
  summary: z.object({ errors: z.number().int(), warnings: z.number().int(), notices: z.number().int() }),
});
export type LogResult = z.infer<typeof LogResult>;
