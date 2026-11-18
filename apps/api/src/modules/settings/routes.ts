import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { count, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import {
  AsteriskConfigBundle, AuditEntry, ConfigFileContent, ConfigFileInfo, ConfigFileParam, ConfigFileWriteInput,
  ConfigFileWriteResult, FeaturesSummary, Paginated, PaginationQuery,
} from '@voip-manager/shared';
import { ConfigFilesService, DIALPLAN_FEATURE_APP_NAMES } from '../../services/config-files.service.js';
import type { Env } from '../../config/env.js';
import { vmAudit } from '../../db/schema/app/index.js';
import { extensions } from '../../db/schema/asterisk/index.js';
import { buildAsteriskConfig } from '../../services/asterisk-config.js';

export const settingsRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app, { env }) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.authorize('settings:read'));
  const tags = ['settings'];
  const files = new ConfigFilesService(env, app.ami);

  // ---------- Archivos de configuración de Asterisk (features.conf, res_parking.conf, ...) ----------
  app.get('/files', { schema: { tags, response: { 200: z.array(ConfigFileInfo) } } }, async () => files.list());

  app.get('/files/:file', { schema: { tags, params: ConfigFileParam, response: { 200: ConfigFileContent } } }, async (req) =>
    files.read(req.params.file),
  );

  app.put(
    '/files/:file',
    { preHandler: [app.authorize('settings:write')], schema: { tags, params: ConfigFileParam, body: ConfigFileWriteInput, response: { 200: ConfigFileWriteResult } } },
    async (req) => {
      const result = await files.write(req.params.file, req.body.content, req.body.hash, req.body.reload);
      await app.audit(req, {
        action: 'write-config',
        resource: 'settings',
        resourceId: req.params.file,
        details: { backend: result.backend, bytes: req.body.content.length, backup: result.backupPath, reload: result.reload?.ok ?? null },
      });
      return result;
    },
  );

  app.get('/features', { schema: { tags, response: { 200: FeaturesSummary } } }, async () => {
    const dialplan = await app.db
      .select({ context: extensions.context, exten: extensions.exten, app: extensions.app, appdata: extensions.appdata })
      .from(extensions)
      .where(inArray(extensions.app, DIALPLAN_FEATURE_APP_NAMES))
      .catch(() => []);
    return files.featuresSummary(dialplan);
  });

  app.get('/asterisk-config', { schema: { tags, response: { 200: AsteriskConfigBundle } } }, async () => {
    const rows = await app.db.selectDistinct({ c: extensions.context }).from(extensions).orderBy(sql`1`).catch(() => []);
    const contexts = Array.from(new Set([env.DEFAULT_CONTEXT, 'from-trunk', ...rows.map((r) => r.c)]));
    return buildAsteriskConfig(env, contexts);
  });

  app.get('/audit', { schema: { tags, querystring: PaginationQuery, response: { 200: Paginated(AuditEntry) } } }, async (req) => {
    const { page, pageSize, search } = req.query;
    const where = search
      ? sql`(${vmAudit.username} LIKE ${'%' + search + '%'} OR ${vmAudit.resource} LIKE ${'%' + search + '%'} OR ${vmAudit.resourceId} LIKE ${'%' + search + '%'} OR ${vmAudit.action} LIKE ${'%' + search + '%'})`
      : undefined;
    const [rows, [total]] = await Promise.all([
      app.db.select().from(vmAudit).where(where).orderBy(desc(vmAudit.id)).limit(pageSize).offset((page - 1) * pageSize),
      app.db.select({ c: count() }).from(vmAudit).where(where),
    ]);
    return {
      items: rows.map((r) => ({ ...r, details: r.details ?? null, createdAt: r.createdAt.toISOString() })),
      total: total?.c ?? 0,
      page,
      pageSize,
    };
  });
};
