import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import {
  ChangePasswordInput, LoginInput, OkResponse, RefreshInput, TokenPair, UserPublic,
} from '@voip-manager/shared';
import type { Env } from '../../config/env.js';
import { vmUsers } from '../../db/schema/app/index.js';
import { hashPassword, verifyPassword } from '../../services/password.js';
import { badRequest, notFound, unauthorized } from '../../services/errors.js';
import { issueTokens, revokeAllUserTokens, revokeRefreshToken, rotateRefreshToken, toUserPublic } from './service.js';

export const authRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app, { env }) => {
  const meta = (req: { ip: string; headers: Record<string, unknown> }) => ({
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  });

  app.post(
    '/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { tags: ['auth'], security: [], body: LoginInput, response: { 200: TokenPair } },
    },
    async (req) => {
      const [user] = await app.db.select().from(vmUsers).where(eq(vmUsers.username, req.body.username));
      const ok = user ? await verifyPassword(user.passwordHash, req.body.password) : false;
      if (!user || !ok) {
        req.log.warn({ username: req.body.username, ip: req.ip }, 'Login fallido');
        throw unauthorized('Usuario o contraseña incorrectos');
      }
      if (!user.active) throw unauthorized('Usuario inactivo');
      await app.db.update(vmUsers).set({ lastLoginAt: new Date() }).where(eq(vmUsers.id, user.id));
      const tokens = await issueTokens(app, { ...user, lastLoginAt: new Date() }, meta(req));
      await app.audit({ ...req, user: { sub: user.id, username: user.username, role: user.role, type: 'access' } } as typeof req, {
        action: 'login',
        resource: 'auth',
        resourceId: user.username,
      });
      return tokens;
    },
  );

  app.post(
    '/refresh',
    { schema: { tags: ['auth'], security: [], body: RefreshInput, response: { 200: TokenPair } } },
    async (req) => {
      const user = await rotateRefreshToken(app, req.body.refreshToken);
      return issueTokens(app, user, meta(req));
    },
  );

  app.post(
    '/logout',
    { preHandler: [app.authenticate], schema: { tags: ['auth'], body: RefreshInput, response: { 200: OkResponse } } },
    async (req) => {
      await revokeRefreshToken(app, req.body.refreshToken);
      return { ok: true as const };
    },
  );

  app.get('/me', { preHandler: [app.authenticate], schema: { tags: ['auth'], response: { 200: UserPublic } } }, async (req) => {
    const [user] = await app.db.select().from(vmUsers).where(eq(vmUsers.id, req.user.sub));
    if (!user) throw notFound('Usuario');
    return toUserPublic(user);
  });

  app.post(
    '/change-password',
    { preHandler: [app.authenticate], schema: { tags: ['auth'], body: ChangePasswordInput, response: { 200: OkResponse } } },
    async (req) => {
      const [user] = await app.db.select().from(vmUsers).where(and(eq(vmUsers.id, req.user.sub), eq(vmUsers.active, true)));
      if (!user) throw notFound('Usuario');
      if (!(await verifyPassword(user.passwordHash, req.body.currentPassword))) throw badRequest('La contraseña actual no es correcta');
      await app.db.update(vmUsers).set({ passwordHash: await hashPassword(req.body.newPassword) }).where(eq(vmUsers.id, user.id));
      await revokeAllUserTokens(app, user.id);
      await app.audit(req, { action: 'change-password', resource: 'auth', resourceId: user.username });
      return { ok: true as const };
    },
  );
};
