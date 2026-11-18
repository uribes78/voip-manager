import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { createDb } from './client.js';
import { vmUsers } from './schema/app/index.js';
import { hashPassword } from '../services/password.js';

const { db, pool } = createDb(env);
try {
  const username = process.env.SEED_ADMIN_USER ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin.1234';
  const [existing] = await db.select({ id: vmUsers.id }).from(vmUsers).where(eq(vmUsers.username, username));
  if (existing) {
    console.log(`Usuario ${username} ya existe, no se modifica.`);
  } else {
    await db.insert(vmUsers).values({
      username,
      passwordHash: await hashPassword(password),
      fullName: 'Administrador',
      role: 'admin',
      active: true,
    });
    console.log(`Usuario ${username} creado con la contraseña inicial indicada (cámbiala al entrar).`);
  }
} finally {
  await pool.end();
}
