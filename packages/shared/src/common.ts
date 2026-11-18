import { z } from 'zod';

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(100).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const Paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });

export const ApiError = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const IdParam = z.object({ id: z.string().min(1).max(40) });
export type IdParam = z.infer<typeof IdParam>;

export const NumericIdParam = z.object({ id: z.coerce.number().int().positive() });

export const OkResponse = z.object({ ok: z.literal(true) });

/** Valores "yes"/"no" que usa Asterisk en realtime. */
export const YesNo = z.enum(['yes', 'no']);
export type YesNo = z.infer<typeof YesNo>;

export const yesNoFromBoolean = (v: boolean | undefined | null): YesNo | undefined =>
  v === undefined || v === null ? undefined : v ? 'yes' : 'no';
export const booleanFromYesNo = (v: string | null | undefined): boolean | undefined =>
  v === undefined || v === null || v === '' ? undefined : v === 'yes' || v === 'true' || v === '1';

/** Record columna=valor limitado a una lista blanca de columnas (apartado "avanzado"). */
export const advancedRecord = (allowed: readonly string[]) =>
  z
    .record(z.string(), z.string().max(255))
    .default({})
    .check((ctx) => {
      const bad = Object.keys(ctx.value).filter((k) => !allowed.includes(k));
      if (bad.length) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: `Columnas no permitidas: ${bad.join(', ')}`,
        });
      }
    });

/**
 * Versión "partial" de un objeto SIN aplicar defaults: en zod 4, `.partial()` conserva los `.default()`,
 * así que un PATCH con un solo campo reiniciaría el resto a sus valores por defecto.
 */
type StripDefault<T> = T extends z.ZodDefault<infer U> ? U : T;
export type PartialWithoutDefaults<T extends z.ZodRawShape> = z.ZodObject<{ [K in keyof T]: z.ZodOptional<StripDefault<T[K]>> }>;

export function partialWithoutDefaults<T extends z.ZodRawShape>(schema: z.ZodObject<T>): PartialWithoutDefaults<T> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? field.removeDefault() : field;
    shape[key] = (inner as z.ZodTypeAny).optional();
  }
  return z.object(shape) as unknown as PartialWithoutDefaults<T>;
}
