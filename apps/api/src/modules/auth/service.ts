import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { TokenPair, UserPublic } from '@voip-manager/shared';
import { vmRefreshTokens, vmUsers, type UserRow } from '../../db/schema/app/index.js';
import { randomToken, sha256 } from '../../services/password.js';
import { unauthorized } from '../../services/errors.js';

export const toUserPublic = (u: UserRow): UserPublic => ({
  id: u.id,
  username: u.username,
  fullName: u.fullName,
  email: u.email ?? null,
  role: u.role,
  active: u.active,
  lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  createdAt: u.createdAt.toISOString(),
});

/** Convierte '15m', '7d', '12h', '30s' a segundos. */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*(s|m|h|d)?$/.exec(ttl.trim());
  if (!m) throw new Error(`TTL inválido: ${ttl}`);
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[(m[2] ?? 's') as 's' | 'm' | 'h' | 'd'] ?? 1;
  return n * mult;
}

export async function issueTokens(
  app: FastifyInstance,
  user: UserRow,
  meta: { ip: string; userAgent?: string; accessTtl: string; refreshTtl: string },
): Promise<TokenPair> {
  const accessToken = app.jwt.sign({ sub: user.id, username: user.username, role: user.role, type: 'access' });
  const refreshToken = randomToken();
  const expiresAt = new Date(Date.now() + ttlToSeconds(meta.refreshTtl) * 1000);
  await app.db.insert(vmRefreshTokens).values({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 255),
  });
  return { accessToken, refreshToken, expiresIn: ttlToSeconds(meta.accessTtl), user: toUserPublic(user) };
}

export async function rotateRefreshToken(app: FastifyInstance, refreshToken: string): Promise<UserRow> {
  const hash = sha256(refreshToken);
  const [row] = await app.db
    .select()
    .from(vmRefreshTokens)
    .where(and(eq(vmRefreshTokens.tokenHash, hash), isNull(vmRefreshTokens.revokedAt), gt(vmRefreshTokens.expiresAt, new Date())));
  if (!row) throw unauthorized('Refresh token inválido o expirado');
  await app.db.update(vmRefreshTokens).set({ revokedAt: new Date() }).where(eq(vmRefreshTokens.id, row.id));
  const [user] = await app.db.select().from(vmUsers).where(and(eq(vmUsers.id, row.userId), eq(vmUsers.active, true)));
  if (!user) throw unauthorized('Usuario inactivo');
  return user;
}

export async function revokeRefreshToken(app: FastifyInstance, refreshToken: string) {
  await app.db
    .update(vmRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(vmRefreshTokens.tokenHash, sha256(refreshToken)), isNull(vmRefreshTokens.revokedAt)));
}

export async function revokeAllUserTokens(app: FastifyInstance, userId: number) {
  await app.db
    .update(vmRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(vmRefreshTokens.userId, userId), isNull(vmRefreshTokens.revokedAt)));
}
