import type { TypedSchema, TypedSchemaError } from 'vee-validate';
import type { z } from 'zod';

/**
 * Adaptador zod 4 -> vee-validate TypedSchema. `@vee-validate/zod` solo soporta zod 3,
 * así que implementamos la interfaz directamente.
 */
export function toTypedSchema<S extends z.ZodType>(schema: S): TypedSchema<z.input<S>, z.output<S>> {
  return {
    __type: 'VVTypedSchema',
    async parse(values: unknown) {
      const result = await schema.safeParseAsync(values);
      if (result.success) {
        return { value: result.data, errors: [] };
      }
      const byPath = new Map<string, TypedSchemaError>();
      for (const issue of result.error.issues) {
        const path = issue.path.map(String).join('.') || '_root';
        const current = byPath.get(path);
        if (current) {
          current.errors.push(issue.message);
        } else {
          byPath.set(path, { path, errors: [issue.message] });
        }
      }
      return { errors: [...byPath.values()] };
    },
    cast(values: unknown) {
      const result = schema.safeParse(values);
      return (result.success ? result.data : values) as z.input<S>;
    },
  };
}
