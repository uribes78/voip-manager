import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MohClass, MohClassCreateInput, MohClassParam, MohClassUpdateInput, MohDeleteQuery, MohEnvironment, MohFile, MohFileParam,
  MohUploadResult, OkResponse,
} from '@voip-manager/shared';
import type { Env } from '../../config/env.js';
import { badRequest, unauthorized } from '../../services/errors.js';
import { MohService } from './service.js';

export const mohRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app) => {
  const svc = new MohService(app);
  const tags = ['moh'];
  const read = [app.authenticate, app.authorize('moh:read')];
  const write = [app.authenticate, app.authorize('moh:write')];

  app.get('/', { preHandler: read, schema: { tags, response: { 200: z.object({ classes: z.array(MohClass), environment: MohEnvironment }) } } }, async () => ({
    classes: await svc.list(),
    environment: await svc.environment(),
  }));

  app.post('/', { preHandler: write, schema: { tags, body: MohClassCreateInput, response: { 201: MohClass } } }, async (req, reply) => {
    const cls = await svc.create(req.body);
    await app.audit(req, { action: 'create', resource: 'moh', resourceId: cls.name, details: { mode: cls.mode, directory: cls.directory } });
    return reply.code(201).send(cls);
  });

  app.post('/reload', { preHandler: write, schema: { tags, response: { 200: z.object({ ok: z.boolean(), response: z.string() }) } } }, async (req) => {
    const r = await svc.reload();
    await app.audit(req, { action: 'reload', resource: 'moh', resourceId: null, details: r });
    return r;
  });

  app.get('/:name', { preHandler: read, schema: { tags, params: MohClassParam, response: { 200: MohClass } } }, async (req) => svc.get(req.params.name));

  app.patch('/:name', { preHandler: write, schema: { tags, params: MohClassParam, body: MohClassUpdateInput, response: { 200: MohClass } } }, async (req) => {
    const cls = await svc.update(req.params.name, req.body);
    await app.audit(req, { action: 'update', resource: 'moh', resourceId: cls.name, details: req.body });
    return cls;
  });

  app.delete('/:name', { preHandler: write, schema: { tags, params: MohClassParam, querystring: MohDeleteQuery, response: { 200: OkResponse } } }, async (req) => {
    await svc.remove(req.params.name, req.query.deleteFiles);
    await app.audit(req, { action: 'delete', resource: 'moh', resourceId: req.params.name, details: { deleteFiles: req.query.deleteFiles } });
    return { ok: true as const };
  });

  app.get('/:name/files', { preHandler: read, schema: { tags, params: MohClassParam, response: { 200: z.array(MohFile) } } }, async (req) =>
    svc.listFiles(req.params.name),
  );

  // Subida multipart (campo "files", uno o varios). Sin esquema de body: lo maneja @fastify/multipart.
  app.post('/:name/files', { preHandler: write, schema: { tags, params: MohClassParam, response: { 200: MohUploadResult } } }, async (req) => {
    if (!req.isMultipart()) throw badRequest('Se esperaba multipart/form-data');
    const files: Array<{ filename: string; buffer: Buffer }> = [];
    for await (const part of req.files()) {
      files.push({ filename: part.filename, buffer: await part.toBuffer() });
    }
    if (!files.length) throw badRequest('No se recibieron archivos');
    const result = await svc.upload(req.params.name, files);
    await app.audit(req, {
      action: 'upload',
      resource: 'moh',
      resourceId: req.params.name,
      details: { files: result.files.map((f) => ({ original: f.original, stored: f.stored, error: f.error })) },
    });
    return result;
  });

  app.delete('/:name/files/:file', { preHandler: write, schema: { tags, params: MohFileParam, response: { 200: OkResponse } } }, async (req) => {
    await svc.deleteFile(req.params.name, req.params.file);
    await app.audit(req, { action: 'delete-file', resource: 'moh', resourceId: req.params.name, details: { file: req.params.file } });
    return { ok: true as const };
  });

  // Previsualización para <audio>: el token viaja en query porque el navegador no manda Authorization.
  app.get('/:name/files/:file/preview', { schema: { tags, params: MohFileParam, querystring: z.object({ token: z.string().min(10) }) } }, async (req, reply) => {
    let role: string;
    try {
      role = app.verifyAccessToken(req.query.token).role;
    } catch {
      throw unauthorized('Token inválido');
    }
    const { hasPermission } = await import('@voip-manager/shared');
    if (!hasPermission(role as never, 'moh:read')) throw unauthorized('Sin permiso moh:read');
    const { buffer, filename } = await svc.preview(req.params.name, req.params.file);
    return reply
      .header('content-type', 'audio/wav')
      .header('content-disposition', `inline; filename="${filename}"`)
      .header('cache-control', 'private, max-age=60')
      .send(buffer);
  });
};
