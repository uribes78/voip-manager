import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, avg, count, desc, eq, gte, like, lte, sql, sum, type SQL } from 'drizzle-orm';
import { CdrQuery, CdrRecord, CdrStats, Paginated } from '@voip-manager/shared';
import { cdr } from '../../db/schema/asterisk/index.js';

const buildWhere = (q: CdrQuery): SQL | undefined => {
  const conds: SQL[] = [];
  if (q.from) conds.push(gte(cdr.start, q.from));
  if (q.to) conds.push(lte(cdr.start, q.to));
  if (q.src) conds.push(like(cdr.src, `${q.src}%`));
  if (q.dst) conds.push(like(cdr.dst, `${q.dst}%`));
  if (q.disposition) conds.push(eq(cdr.disposition, q.disposition));
  if (q.minDuration !== undefined) conds.push(gte(cdr.duration, q.minDuration));
  if (q.search) conds.push(sql`(${cdr.src} LIKE ${'%' + q.search + '%'} OR ${cdr.dst} LIKE ${'%' + q.search + '%'} OR ${cdr.clid} LIKE ${'%' + q.search + '%'})`);
  return conds.length ? and(...conds) : undefined;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const cdrRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.authorize('cdr:read'));
  const tags = ['cdr'];

  app.get('/', { schema: { tags, querystring: CdrQuery, response: { 200: Paginated(CdrRecord) } } }, async (req) => {
    const where = buildWhere(req.query);
    const { page, pageSize } = req.query;
    const [rows, [total]] = await Promise.all([
      app.db.select().from(cdr).where(where).orderBy(desc(cdr.start)).limit(pageSize).offset((page - 1) * pageSize),
      app.db.select({ c: count() }).from(cdr).where(where),
    ]);
    return {
      items: rows.map((r) => ({
        uniqueid: r.uniqueid ?? '',
        linkedid: r.linkedid,
        accountcode: r.accountcode,
        src: r.src ?? '',
        dst: r.dst ?? '',
        dcontext: r.dcontext ?? '',
        clid: r.clid ?? '',
        channel: r.channel ?? '',
        dstchannel: r.dstchannel,
        lastapp: r.lastapp,
        lastdata: r.lastdata,
        start: iso(r.start),
        answer: iso(r.answer),
        end: iso(r.end),
        duration: r.duration ?? 0,
        billsec: r.billsec ?? 0,
        disposition: r.disposition ?? '',
        userfield: r.userfield,
      })),
      total: total?.c ?? 0,
      page,
      pageSize,
    };
  });

  app.get('/stats', { schema: { tags, querystring: CdrQuery, response: { 200: CdrStats } } }, async (req) => {
    const where = buildWhere(req.query);
    const [row] = await app.db
      .select({
        total: count(),
        answered: sql<number>`SUM(${cdr.disposition} = 'ANSWERED')`,
        noAnswer: sql<number>`SUM(${cdr.disposition} = 'NO ANSWER')`,
        busy: sql<number>`SUM(${cdr.disposition} = 'BUSY')`,
        failed: sql<number>`SUM(${cdr.disposition} IN ('FAILED','CONGESTION'))`,
        totalBillsec: sum(cdr.billsec),
        avgBillsec: avg(cdr.billsec),
      })
      .from(cdr)
      .where(where);
    return {
      total: Number(row?.total ?? 0),
      answered: Number(row?.answered ?? 0),
      noAnswer: Number(row?.noAnswer ?? 0),
      busy: Number(row?.busy ?? 0),
      failed: Number(row?.failed ?? 0),
      totalBillsec: Number(row?.totalBillsec ?? 0),
      avgBillsec: Number(row?.avgBillsec ?? 0),
    };
  });
};
