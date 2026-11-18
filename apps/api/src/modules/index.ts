import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../config/env.js';
import { healthRoutes } from './health/routes.js';
import { authRoutes } from './auth/routes.js';
import { userRoutes } from './users/routes.js';
import { extensionRoutes } from './extensions/routes.js';
import { trunkRoutes } from './trunks/routes.js';
import { queueRoutes } from './queues/routes.js';
import { dialplanRoutes } from './dialplan/routes.js';
import { cdrRoutes } from './cdr/routes.js';
import { amiRoutes } from './ami/routes.js';
import { logRoutes } from './logs/routes.js';
import { settingsRoutes } from './settings/routes.js';
import { mohRoutes } from './moh/routes.js';

export const registerRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth', env });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(extensionRoutes, { prefix: '/extensions', env });
  await app.register(trunkRoutes, { prefix: '/trunks', env });
  await app.register(queueRoutes, { prefix: '/queues' });
  await app.register(dialplanRoutes, { prefix: '/dialplan' });
  await app.register(cdrRoutes, { prefix: '/cdr' });
  await app.register(amiRoutes, { prefix: '/ami', env });
  await app.register(logRoutes, { prefix: '/logs', env });
  await app.register(settingsRoutes, { prefix: '/settings', env });
  await app.register(mohRoutes, { prefix: '/moh', env });
};
