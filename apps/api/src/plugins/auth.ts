import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { hasPermission, type Permission, type Role } from '@voip-manager/shared';
import { forbidden, unauthorized } from '../services/errors.js';

export interface AccessTokenPayload {
  sub: number;
  username: string;
  role: Role;
  type: 'access';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    authorize: (...permissions: Permission[]) => preHandlerHookHandler;
    verifyAccessToken: (token: string) => AccessTokenPayload;
  }
}

export interface AuthPluginOptions {
  secret: string;
  accessTtl: string;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  await app.register(fastifyJwt, { secret: opts.secret, sign: { expiresIn: opts.accessTtl } });

  app.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<AccessTokenPayload>();
      if (payload.type !== 'access') throw unauthorized('Token inválido');
    } catch (e) {
      if (e instanceof Error && e.name === 'HttpError') throw e;
      throw unauthorized('Token inválido o expirado');
    }
  });

  app.decorate('authorize', (...permissions: Permission[]) => {
    const handler: preHandlerHookHandler = async (req) => {
      const user = req.user;
      if (!user) throw unauthorized();
      const missing = permissions.filter((p) => !hasPermission(user.role, p));
      if (missing.length) throw forbidden(`Permiso requerido: ${missing.join(', ')}`);
    };
    return handler;
  });

  app.decorate('verifyAccessToken', (token: string) => {
    const payload = app.jwt.verify<AccessTokenPayload>(token);
    if (payload.type !== 'access') throw unauthorized('Token inválido');
    return payload;
  });
};

export default fp(plugin, { name: 'auth' });
