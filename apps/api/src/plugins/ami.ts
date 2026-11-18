import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { AmiService } from '../services/ami.service.js';
import type { Env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    ami: AmiService;
  }
}

const plugin: FastifyPluginAsync<{ env: Env; autoStart?: boolean }> = async (app, opts) => {
  const ami = new AmiService(opts.env, app.log.child({ module: 'ami' }));
  app.decorate('ami', ami);
  if (opts.autoStart !== false) {
    app.addHook('onReady', async () => ami.start());
  }
  app.addHook('onClose', async () => {
    await ami.stop();
  });
};

export default fp(plugin, { name: 'ami' });
