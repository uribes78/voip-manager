import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ListenService } from '../services/listen.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    liveListen: ListenService;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  const listen = new ListenService(app);
  app.decorate('liveListen', listen);
  app.ami.calls.setListenerCounter((id) => listen.listenerCount(id));
  app.ami.calls.on('call-removed', ({ id }: { id: string }) => void listen.endCall(id));
};

export default fp(plugin, { name: 'listen', dependencies: ['ami'] });
