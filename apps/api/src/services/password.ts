import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';

export const hashPassword = (plain: string) => hash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (hashed: string, plain: string) => verify(hashed, plain).catch(() => false);

/** Secreto SIP aleatorio legible (sin caracteres ambiguos). */
export function generateSipSecret(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
