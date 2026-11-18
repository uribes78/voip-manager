import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { asteriskSchemaInstalled, pingDb } from '../../db/client.js';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        security: [],
        response: {
          200: z.object({
            status: z.enum(['ok', 'degraded']),
            db: z.boolean(),
            ami: z.boolean(),
            schema: z.object({ config: z.boolean(), cdr: z.boolean() }),
            uptime: z.number(),
            version: z.string(),
          }),
        },
      },
    },
    async () => {
      const db = await pingDb(app.db);
      const schema = db ? await asteriskSchemaInstalled(app.db).catch(() => ({ config: false, cdr: false })) : { config: false, cdr: false };
      const ami = app.ami.isConnected();
      return {
        status: db && ami && schema.config ? ('ok' as const) : ('degraded' as const),
        db,
        ami,
        schema,
        uptime: Math.round(process.uptime()),
        version: process.env.npm_package_version ?? '0.1.0',
      };
    },
  );
};
