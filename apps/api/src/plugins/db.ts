import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createDb, type Db } from '../db/client.js';
import type { Env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

const plugin: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const { db, pool } = createDb(opts.env);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await pool.end();
  });
};

export default fp(plugin, { name: 'db' });
