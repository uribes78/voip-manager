import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, count, desc, eq, like, or, type SQL } from 'drizzle-orm';
import {
  CreateUserInput, NumericIdParam, OkResponse, Paginated, PaginationQuery, UpdateUserInput, UserPublic,
} from '@voip-manager/shared';
import { vmUsers } from '../../db/schema/app/index.js';
import { hashPassword } from '../../services/password.js';
import { badRequest, conflict, notFound } from '../../services/errors.js';
import { revokeAllUserTokens, toUserPublic } from '../auth/service.js';

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/',
    { preHandler: [app.authorize('users:read')], schema: { tags: ['users'], querystring: PaginationQuery, response: { 200: Paginated(UserPublic) } } },
    async (req) => {
      const { page, pageSize, search } = req.query;
      const where: SQL | undefined = search
        ? or(like(vmUsers.username, `%${search}%`), like(vmUsers.fullName, `%${search}%`), like(vmUsers.email, `%${search}%`))
        : undefined;
      const [rows, [total]] = await Promise.all([
        app.db.select().from(vmUsers).where(where).orderBy(desc(vmUsers.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
        app.db.select({ c: count() }).from(vmUsers).where(where),
      ]);
      return { items: rows.map(toUserPublic), total: total?.c ?? 0, page, pageSize };
    },
  );

  app.post(
    '/',
    { preHandler: [app.authorize('users:write')], schema: { tags: ['users'], body: CreateUserInput, response: { 201: UserPublic } } },
    async (req, reply) => {
      const [dup] = await app.db.select({ id: vmUsers.id }).from(vmUsers).where(eq(vmUsers.username, req.body.username));
      if (dup) throw conflict('El nombre de usuario ya existe');
      const [res] = await app.db.insert(vmUsers).values({
        username: req.body.username,
        passwordHash: await hashPassword(req.body.password),
        fullName: req.body.fullName,
        email: req.body.email ?? null,
        role: req.body.role,
        active: req.body.active,
      });
      const [user] = await app.db.select().from(vmUsers).where(eq(vmUsers.id, res.insertId));
      await app.audit(req, { action: 'create', resource: 'users', resourceId: req.body.username, details: { role: req.body.role } });
      return reply.code(201).send(toUserPublic(user!));
    },
  );

  app.get(
    '/:id',
    { preHandler: [app.authorize('users:read')], schema: { tags: ['users'], params: NumericIdParam, response: { 200: UserPublic } } },
    async (req) => {
      const [user] = await app.db.select().from(vmUsers).where(eq(vmUsers.id, req.params.id));
      if (!user) throw notFound('Usuario');
      return toUserPublic(user);
    },
  );

  app.patch(
    '/:id',
    { preHandler: [app.authorize('users:write')], schema: { tags: ['users'], params: NumericIdParam, body: UpdateUserInput, response: { 200: UserPublic } } },
    async (req) => {
      const [user] = await app.db.select().from(vmUsers).where(eq(vmUsers.id, req.params.id));
      if (!user) throw notFound('Usuario');
      if (user.id === req.user.sub && req.body.role && req.body.role !== user.role) throw badRequest('No puedes cambiar tu propio rol');
      if (user.id === req.user.sub && req.body.active === false) throw badRequest('No puedes desactivarte a ti mismo');
      const { password, ...rest } = req.body;
      await app.db
        .update(vmUsers)
        .set({ ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
        .where(eq(vmUsers.id, user.id));
      if (password || rest.active === false || (rest.role && rest.role !== user.role)) await revokeAllUserTokens(app, user.id);
      const [updated] = await app.db.select().from(vmUsers).where(eq(vmUsers.id, user.id));
      await app.audit(req, { action: 'update', resource: 'users', resourceId: user.username, details: { ...rest, password: password ? '***' : undefined } });
      return toUserPublic(updated!);
    },
  );

  app.delete(
    '/:id',
    { preHandler: [app.authorize('users:write')], schema: { tags: ['users'], params: NumericIdParam, response: { 200: OkResponse } } },
    async (req) => {
      if (req.params.id === req.user.sub) throw badRequest('No puedes eliminarte a ti mismo');
      const [user] = await app.db.select().from(vmUsers).where(eq(vmUsers.id, req.params.id));
      if (!user) throw notFound('Usuario');
      const [admins] = await app.db.select({ c: count() }).from(vmUsers).where(and(eq(vmUsers.role, 'admin'), eq(vmUsers.active, true)));
      if (user.role === 'admin' && (admins?.c ?? 0) <= 1) throw badRequest('No se puede desactivar al último administrador');
      await app.db.update(vmUsers).set({ active: false }).where(eq(vmUsers.id, user.id));
      await revokeAllUserTokens(app, user.id);
      await app.audit(req, { action: 'deactivate', resource: 'users', resourceId: user.username });
      return { ok: true as const };
    },
  );
};
