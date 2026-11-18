import fp from 'fastify-plugin';
import ipRangeCheck from 'ip-range-check';
import type { FastifyPluginAsync } from 'fastify';

export interface IpAllowlistOptions {
  allowed: string[];
}

/** Rechaza con 403 cualquier petición cuya IP no esté en la lista (vacía = permitir todas). */
const plugin: FastifyPluginAsync<IpAllowlistOptions> = async (app, opts) => {
  const ranges = opts.allowed.filter(Boolean);
  if (ranges.length === 0) {
    app.log.warn('ALLOWED_IPS vacío: se permite el acceso desde cualquier IP');
    return;
  }
  app.addHook('onRequest', async (req, reply) => {
    const ip = req.ip.replace(/^::ffff:/, '');
    if (!ipRangeCheck(ip, ranges)) {
      req.log.warn({ ip }, 'IP no autorizada');
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: `IP ${ip} no autorizada` });
    }
  });
};

export default fp(plugin, { name: 'ip-allowlist' });
