import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { LogQuery, LogResult } from '@voip-manager/shared';
import type { Env } from '../../config/env.js';
import { readLogs } from '../../services/logs.service.js';

export const logRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app, { env }) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.authorize('logs:read'));

  app.get('/', { schema: { tags: ['logs'], querystring: LogQuery, response: { 200: LogResult } } }, async (req) => {
    const path = req.query.source === 'asterisk' ? env.ASTERISK_LOG_PATH : env.SERVICE_LOG_PATH;
    return readLogs(path, req.query);
  });
};
