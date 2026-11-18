import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { vmAudit } from '../db/schema/app/index.js';

export type AuditFn = (
  req: FastifyRequest,
  entry: { action: string; resource: string; resourceId?: string | null; details?: unknown },
) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditFn;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.decorate('audit', async (req, entry) => {
    try {
      await app.db.insert(vmAudit).values({
        userId: req.user?.sub ?? null,
        username: req.user?.username ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        details: entry.details ?? null,
        ip: req.ip,
      });
    } catch (e) {
      req.log.warn({ err: e }, 'No se pudo guardar auditoría');
    }
  });
};

export default fp(plugin, { name: 'audit', dependencies: ['db'] });
