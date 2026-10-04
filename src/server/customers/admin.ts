// Panel > Müşteriler — liste, detay, not/etiket, KVKK anonimleştirme.
//
// KVKK anonimleştirme yalnız MÜŞTERİ PROFİLİNİ (Customer + Address) siler;
// geçmiş siparişlerdeki adres/isim ANLIK GÖRÜNTÜSÜ (Order.shippingAddress vb.)
// bilinçli olarak korunur — bunlar mali/hukuki saklama süresine tabi belgelerdir
// (fatura, e-Ticaret Kanunu), müşteri profiliyle aynı şey değildir.

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { jsonArray } from '../catalog/mapping';
import { REVENUE_STATUSES } from '../orders/state-machine';

export class CustomerAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'CustomerAdminError';
  }
}

export interface AdminCustomerRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isGuest: boolean;
  marketingOptIn: boolean;
  tags: string[];
  orderCount: number;
  totalSpentMinor: number;
  lastOrderAt: string | null;
  createdAt: string;
  anonymizedAt: string | null;
}

export interface CustomerListParams {
  q?: string;
  tag?: string;
  sort?: 'yeni' | 'harcama' | 'siparis';
  page?: number;
  pageSize?: number;
}

export async function listAdminCustomers(params: CustomerListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));
  const where: Prisma.CustomerWhereInput = { store: currentStore(), isGuest: false };
  if (params.q) {
    const q = params.q.trim();
    where.OR = [{ email: { contains: q.toLowerCase() } }, { firstName: { contains: q } }, { lastName: { contains: q } }, { phone: { contains: q } }];
  }

  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      include: { _count: { select: { orders: true } } },
      orderBy:
        params.sort === 'siparis'
          ? { orders: { _count: 'desc' } }
          : { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const filtered = params.tag ? rows.filter((r) => jsonArray<string>(r.tags).includes(params.tag!)) : rows;
  const ids = filtered.map((r) => r.id);
  const spend = ids.length
    ? await db.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: { in: [...REVENUE_STATUSES] } }, _sum: { grandTotalMinor: true } })
    : [];
  const spendById = new Map(spend.map((s) => [s.customerId, s._sum.grandTotalMinor ?? 0]));

  let items: AdminCustomerRow[] = filtered.map((r) => ({
    id: r.id,
    email: r.email,
    name: [r.firstName, r.lastName].filter(Boolean).join(' '),
    phone: r.phone,
    isGuest: r.isGuest,
    marketingOptIn: r.marketingOptIn,
    tags: jsonArray<string>(r.tags),
    orderCount: r._count.orders,
    totalSpentMinor: spendById.get(r.id) ?? 0,
    lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    anonymizedAt: r.anonymizedAt?.toISOString() ?? null,
  }));

  if (params.sort === 'harcama') items = [...items].sort((a, b) => b.totalSpentMinor - a.totalSpentMinor);

  return { items, total: params.tag ? filtered.length : total, page, pageSize, pageCount: Math.max(1, Math.ceil((params.tag ? filtered.length : total) / pageSize)) };
}

export interface AdminCustomerDetail extends AdminCustomerRow {
  note: string;
  addresses: {
    id: string; type: string; title: string; firstName: string; lastName: string; phone: string;
    city: string; district: string; addressLine: string; isDefault: boolean; isCorporate: boolean;
  }[];
  orders: { id: string; orderNumber: string; status: string; grandTotalMinor: number; placedAt: string }[];
  returns: { id: string; status: string; requestedAt: string }[];
}

export async function getAdminCustomer(id: string): Promise<AdminCustomerDetail | null> {
  const row = await db.customer.findFirst({
    where: { id, store: currentStore() },
    include: {
      addresses: { orderBy: { isDefault: 'desc' } },
      orders: { orderBy: { placedAt: 'desc' }, take: 20, select: { id: true, orderNumber: true, status: true, grandTotalMinor: true, placedAt: true } },
      returns: { orderBy: { requestedAt: 'desc' }, take: 20, select: { id: true, status: true, requestedAt: true } },
      _count: { select: { orders: true } },
    },
  });
  if (!row) return null;

  const spend = await db.order.aggregate({ where: { customerId: id, status: { in: [...REVENUE_STATUSES] } }, _sum: { grandTotalMinor: true } });

  return {
    id: row.id,
    email: row.email,
    name: [row.firstName, row.lastName].filter(Boolean).join(' '),
    phone: row.phone,
    isGuest: row.isGuest,
    marketingOptIn: row.marketingOptIn,
    tags: jsonArray<string>(row.tags),
    orderCount: row._count.orders,
    totalSpentMinor: spend._sum.grandTotalMinor ?? 0,
    lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
    note: row.note ?? '',
    addresses: row.addresses.map((a) => ({
      id: a.id, type: a.type, title: a.title, firstName: a.firstName, lastName: a.lastName, phone: a.phone,
      city: a.city, district: a.district, addressLine: a.addressLine, isDefault: a.isDefault, isCorporate: a.isCorporate,
    })),
    orders: row.orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, grandTotalMinor: o.grandTotalMinor, placedAt: o.placedAt.toISOString() })),
    returns: row.returns.map((r) => ({ id: r.id, status: r.status, requestedAt: r.requestedAt.toISOString() })),
  };
}

export const customerMetaSchema = z.object({
  note: z.string().trim().max(2000).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
});

export async function updateCustomerMeta(id: string, raw: unknown, user: AdminUser, ip: string | null) {
  const input = customerMetaSchema.parse(raw);
  const current = await db.customer.findFirst({ where: { id, store: currentStore() } });
  if (!current) throw new CustomerAdminError('Müşteri bulunamadı.', 404);

  const updated = await db.customer.update({
    where: { id },
    data: { note: input.note, tags: input.tags as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
  });
  await auditChange({
    user, action: 'guncelle', entityType: 'Customer', entityId: id,
    before: { note: current.note, tags: jsonArray<string>(current.tags) },
    after: { note: input.note, tags: input.tags },
    ip,
  });
  return updated;
}

/**
 * KVKK anonimleştirme — geri alınamaz. Giriş kapatılır (parola/oturumlar
 * silinir), kişisel alanlar maskelenir. Sipariş kayıtları saklanır.
 */
export async function anonymizeCustomer(id: string, user: AdminUser, ip: string | null): Promise<void> {
  const current = await db.customer.findFirst({ where: { id, store: currentStore() } });
  if (!current) throw new CustomerAdminError('Müşteri bulunamadı.', 404);
  if (current.anonymizedAt) throw new CustomerAdminError('Bu müşteri zaten anonimleştirilmiş.', 409);

  const placeholder = `silindi-${id}@anonim.mixle.local`;

  await db.$transaction([
    db.customer.update({
      where: { id },
      data: {
        email: placeholder,
        phone: null,
        firstName: 'Silinmiş',
        lastName: 'Müşteri',
        passwordHash: null,
        marketingOptIn: false,
        anonymizedAt: new Date(),
        version: { increment: 1 },
      },
    }),
    db.address.updateMany({
      where: { customerId: id },
      data: { firstName: '', lastName: '', phone: '', addressLine: '', neighborhood: '', title: '', companyName: null, taxOffice: null, taxNumber: null, identityNumberEnc: null },
    }),
    db.customerSession.deleteMany({ where: { customerId: id } }),
    db.passwordResetToken.deleteMany({ where: { customerId: id } }),
  ]);

  await auditChange({
    user, action: 'guncelle', entityType: 'Customer', entityId: id,
    before: { email: current.email, anonymizedAt: null },
    after: { email: placeholder, anonymizedAt: new Date().toISOString() },
    ip,
  });
}
