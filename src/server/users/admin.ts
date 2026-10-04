// Panel > Ayarlar > Kullanıcılar — CRUD. `npm run admin:create-user` CLI'sinin
// panel karşılığı; aynı doğrulama ve oturum iptali kurallarını uygular.
// Yalnız `sahip` erişebilir (`kullanici:yonet`).

import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { hashPassword, passwordProblem } from '../auth/password';
import { ROLES, type Role } from '../auth/rbac';

export class UserAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'UserAdminError';
  }
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function toRow(u: { id: string; email: string; name: string; role: string; isActive: boolean; lastLoginAt: Date | null; createdAt: Date }): AdminUserRow {
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role, isActive: u.isActive, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() };
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const rows = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toRow);
}

export const createUserSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta girin').max(200),
  name: z.string().trim().max(80).default(''),
  role: z.enum(ROLES),
  password: z.string(),
});

export async function createAdminUser(raw: unknown, actor: AdminUser, ip: string | null): Promise<AdminUserRow> {
  const parsed = createUserSchema.parse(raw);
  const input = { ...parsed, email: parsed.email.toLocaleLowerCase('tr') };
  const problem = passwordProblem(input.password);
  if (problem) throw new UserAdminError(problem, 422);

  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new UserAdminError('Bu e-posta ile zaten bir kullanıcı var.', 409);

  const passwordHash = await hashPassword(input.password);
  const row = await db.user.create({
    data: { email: input.email, name: input.name || input.email.split('@')[0], role: input.role, passwordHash },
  });
  await auditChange({ user: actor, action: 'olustur', entityType: 'User', entityId: row.id, after: { email: row.email, role: row.role }, ip });
  return toRow(row);
}

export const updateUserSchema = z.object({
  name: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  /** Verilirse parola değiştirilir ve açık oturumlar kapatılır. */
  password: z.string().optional(),
});

export async function updateAdminUser(id: string, raw: unknown, actor: AdminUser, ip: string | null): Promise<AdminUserRow> {
  const input = updateUserSchema.parse(raw);
  const current = await db.user.findUnique({ where: { id } });
  if (!current) throw new UserAdminError('Kullanıcı bulunamadı.', 404);

  const demotingOrDeactivatingOwner =
    current.role === 'sahip' && ((input.role !== undefined && input.role !== 'sahip') || input.isActive === false);
  if (demotingOrDeactivatingOwner) {
    const activeOwners = await db.user.count({ where: { role: 'sahip', isActive: true, id: { not: id } } });
    if (activeOwners === 0) throw new UserAdminError('Son aktif sahip kullanıcısı düşürülemez/pasife alınamaz.', 409);
  }
  if (id === actor.id && (input.isActive === false || (input.role && input.role !== 'sahip'))) {
    throw new UserAdminError('Kendi hesabınızı pasife alamaz veya yetkinizi düşüremezsiniz.', 409);
  }

  let passwordHash: string | undefined;
  if (input.password) {
    const problem = passwordProblem(input.password);
    if (problem) throw new UserAdminError(problem, 422);
    passwordHash = await hashPassword(input.password);
  }

  const row = await db.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  if (passwordHash || input.isActive === false) {
    await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  await auditChange({
    user: actor, action: 'guncelle', entityType: 'User', entityId: id,
    before: { role: current.role, isActive: current.isActive },
    after: { role: row.role, isActive: row.isActive, passwordChanged: Boolean(passwordHash) },
    ip,
  });
  return toRow(row);
}
