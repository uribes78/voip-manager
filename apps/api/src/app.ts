import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  serializerCompiler, validatorCompiler, jsonSchemaTransform, type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.js';
import dbPlugin from './plugins/db.js';
import amiPlugin from './plugins/ami.js';
import authPlugin from './plugins/auth.js';
import auditPlugin from './plugins/audit.js';
import ipAllowlist from './plugins/ip-allowlist.js';
import errorHandler from './plugins/error-handler.js';
import { registerRoutes } from './modules/index.js';
import { eventsWebSocket } from './ws/events.js';

export type App = FastifyInstance;

export interface BuildOptions {
  env: Env;
  /** false en pruebas para no abrir la sesión AMI. */
  amiAutoStart?: boolean;
}

export async function buildApp({ env, amiAutoStart = true }: BuildOptions): Promise<App> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : {}),
    },
    trustProxy: true,
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider<ZodTypeProvider>();

  app.decorate('envProd', env.NODE_ENV === 'production');
  // Acepta DELETE/POST con content-type JSON y cuerpo vacío (comportamiento habitual de clientes fetch).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body === undefined) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      e.statusCode = 400;
      done(e, undefined);
    }
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorHandler);
  await app.register(ipAllowlist, { allowed: env.ALLOWED_IPS });
  await app.register(cors, {
    origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((s) => s.trim()) : false,
    credentials: true,
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(dbPlugin, { env });
  await app.register(amiPlugin, { env, autoStart: amiAutoStart });
  await app.register(authPlugin, { secret: env.JWT_SECRET, accessTtl: env.JWT_ACCESS_TTL });
  await app.register(auditPlugin);
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 64 * 1024 * 1024, files: 25 } });

  await app.register(swagger, {
    openapi: {
      info: { title: 'voip-manager API', version: '0.1.0', description: 'Administración de Asterisk vía Realtime' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await app.register(registerRoutes, { prefix: '/api/v1', env });
  await app.register(eventsWebSocket, { prefix: '/ws' });

  // Frontend compilado (producción): apps/web/dist o WEB_DIST. Un solo not-found handler: JSON para /api y /ws,
  // index.html (SPA fallback) para el resto cuando existe el build.
  const webDist = env.WEB_DIST ?? resolve(process.cwd(), '../web/dist');
  const hasWeb = existsSync(webDist);
  if (hasWeb) {
    // wildcard: true sirve cualquier archivo del dist aunque se haya generado después de arrancar (builds nuevos).
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: true });
    app.log.info({ webDist }, 'Sirviendo frontend estático');
  }
  app.setNotFoundHandler((req, reply) => {
    if (hasWeb && req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/ws')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Ruta ${req.method} ${req.url} no existe` });
  });

  return app;
}
