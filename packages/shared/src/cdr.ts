import { z } from 'zod';
import { PaginationQuery } from './common.js';

export const CdrQuery = PaginationQuery.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  src: z.string().trim().max(80).optional(),
  dst: z.string().trim().max(80).optional(),
  disposition: z.enum(['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED', 'CONGESTION']).optional(),
  minDuration: z.coerce.number().int().min(0).optional(),
});
export type CdrQuery = z.infer<typeof CdrQuery>;

export const CdrRecord = z.object({
  uniqueid: z.string(),
  linkedid: z.string().nullable(),
  accountcode: z.string().nullable(),
  src: z.string(),
  dst: z.string(),
  dcontext: z.string(),
  clid: z.string(),
  channel: z.string(),
  dstchannel: z.string().nullable(),
  lastapp: z.string().nullable(),
  lastdata: z.string().nullable(),
  start: z.string().nullable(),
  answer: z.string().nullable(),
  end: z.string().nullable(),
  duration: z.number().int(),
  billsec: z.number().int(),
  disposition: z.string(),
  userfield: z.string().nullable(),
});
export type CdrRecord = z.infer<typeof CdrRecord>;

export const CdrStats = z.object({
  total: z.number().int(),
  answered: z.number().int(),
  noAnswer: z.number().int(),
  busy: z.number().int(),
  failed: z.number().int(),
  totalBillsec: z.number().int(),
  avgBillsec: z.number(),
});
export type CdrStats = z.infer<typeof CdrStats>;
