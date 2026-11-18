import { z } from 'zod';

export const Role = z.enum(['admin', 'operator', 'viewer']);
export type Role = z.infer<typeof Role>;

export const Resource = z.enum([
  'users',
  'extensions',
  'trunks',
  'queues',
  'dialplan',
  'cdr',
  'ami',
  'logs',
  'settings',
]);
export type Resource = z.infer<typeof Resource>;

export const Action = z.enum(['read', 'write', 'execute']);
export type Action = z.infer<typeof Action>;

export type Permission = `${Resource}:${Action}`;

const all = (actions: Action[]) =>
  Resource.options.flatMap((r) => actions.map((a) => `${r}:${a}` as Permission));

/** Matriz estática de permisos por rol. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: all(['read', 'write', 'execute']),
  operator: [
    ...(['extensions', 'trunks', 'queues', 'dialplan'] as Resource[]).flatMap(
      (r) => [`${r}:read`, `${r}:write`] as Permission[],
    ),
    'cdr:read',
    'logs:read',
    'ami:read',
    'ami:execute',
    'settings:read',
  ],
  viewer: all(['read']).filter((p) => p !== 'users:read'),
};

export const hasPermission = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);

export const LoginInput = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const UserPublic = z.object({
  id: z.number().int(),
  username: z.string(),
  fullName: z.string(),
  email: z.string().email().nullable(),
  role: Role,
  active: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type UserPublic = z.infer<typeof UserPublic>;

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: UserPublic,
});
export type TokenPair = z.infer<typeof TokenPair>;

export const RefreshInput = z.object({ refreshToken: z.string().min(10) });
export type RefreshInput = z.infer<typeof RefreshInput>;

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const CreateUserInput = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(100),
  email: z.string().email().nullable().optional(),
  role: Role,
  active: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = CreateUserInput.partial().omit({ username: true });
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;
