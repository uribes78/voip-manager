import { z } from 'zod';
import { PaginationQuery, YesNo, partialWithoutDefaults } from './common.js';
import { QUEUE_COLUMNS, QUEUE_STRATEGIES } from './asterisk-columns.js';
import { EndpointId } from './extensions.js';

export const QueueName = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo');

export const QueueBase = z.object({
  name: QueueName,
  description: z.string().trim().max(255).optional(),
  strategy: z.enum(QUEUE_STRATEGIES).default('ringall'),
  musiconhold: z.string().trim().max(128).default('default'),
  context: z.string().trim().max(128).optional().describe('Contexto para salir de la cola marcando un dígito'),
  timeout: z.number().int().min(0).max(600).default(15),
  retry: z.number().int().min(0).max(600).default(5),
  wrapuptime: z.number().int().min(0).max(3600).default(0),
  maxlen: z.number().int().min(0).max(1000).default(0),
  servicelevel: z.number().int().min(0).max(3600).default(60),
  weight: z.number().int().min(0).max(100).default(0),
  announceFrequency: z.number().int().min(0).max(3600).default(0),
  announceHoldtime: z.enum(['yes', 'no', 'once']).default('no'),
  announcePosition: z.enum(['yes', 'no', 'limit', 'more']).default('no'),
  periodicAnnounceFrequency: z.number().int().min(0).max(3600).default(0),
  joinempty: z.string().trim().max(128).default('yes'),
  leavewhenempty: z.string().trim().max(128).default('no'),
  ringinuse: z.boolean().default(false),
  autopause: z.enum(['yes', 'no', 'all']).default('no'),
  reportholdtime: YesNo.default('no'),
  timeoutrestart: YesNo.default('no'),
  advanced: z
    .record(z.string(), z.string().max(255))
    .default({})
    .refine((rec) => Object.keys(rec).every((k) => (QUEUE_COLUMNS as readonly string[]).includes(k)), {
      message: 'Columnas no permitidas en avanzado',
    }),
});

export const QueueCreateInput = QueueBase;
export type QueueCreateInput = z.infer<typeof QueueCreateInput>;
export type QueueCreateForm = z.input<typeof QueueBase>;

export const QueueUpdateInput = partialWithoutDefaults(QueueBase.omit({ name: true }));
export type QueueUpdateInput = z.infer<typeof QueueUpdateInput>;

export const QueueListQuery = PaginationQuery;

export const QueueMember = z.object({
  uniqueid: z.number().int(),
  queueName: z.string(),
  interface: z.string(),
  memberName: z.string().nullable(),
  stateInterface: z.string().nullable(),
  penalty: z.number().int(),
  paused: z.boolean(),
  extensionId: z.string().nullable(),
  extensionDisplayName: z.string().nullable(),
  status: z.string().optional().describe('Estado en tiempo real reportado por AMI'),
});
export type QueueMember = z.infer<typeof QueueMember>;

export const QueueMemberAddInput = z.object({
  extensionId: EndpointId,
  penalty: z.number().int().min(0).max(100).default(0),
  paused: z.boolean().default(false),
});
export type QueueMemberAddInput = z.infer<typeof QueueMemberAddInput>;

export const QueueMemberUpdateInput = partialWithoutDefaults(QueueMemberAddInput.omit({ extensionId: true }));
export type QueueMemberUpdateInput = z.infer<typeof QueueMemberUpdateInput>;

export const Queue = QueueBase.extend({
  membersCount: z.number().int(),
  members: z.array(QueueMember).optional(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export type Queue = z.infer<typeof Queue>;
