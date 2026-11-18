import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { HttpError } from '../services/errors.js';

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(422).send({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Datos inválidos',
        details: error.validation.map((v) => ({ path: v.instancePath, message: v.message, params: v.params })),
      });
    }
    if (isResponseSerializationError(error)) {
      req.log.error({ err: error, issues: error.cause.issues }, 'Respuesta no cumple el esquema');
      return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Respuesta inválida del servidor' });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
        details: error.details,
      });
    }
    const err = error as { statusCode?: number; code?: string; message: string };
    // Errores MySQL comunes
    if (err.code === 'ER_DUP_ENTRY') {
      return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Ya existe un registro con ese identificador' });
    }
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Falta una tabla del esquema. ¿Ejecutaste las migraciones (Alembic y Drizzle)?',
        details: err.message,
      });
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'PROTOCOL_CONNECTION_LOST') {
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Base de datos no disponible' });
    }
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err: error }, 'Error no controlado');
    return reply.code(status).send({
      statusCode: status,
      error: status >= 500 ? 'Internal Server Error' : (err.code ?? 'Error'),
      message: status >= 500 && app.envProd ? 'Error interno' : err.message,
    });
  });

};

declare module 'fastify' {
  interface FastifyInstance {
    envProd: boolean;
  }
}

export default fp(plugin, { name: 'error-handler' });
