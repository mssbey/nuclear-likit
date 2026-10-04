// Canlı arama önerileri — header arama katmanı kullanır.

import { listProducts } from '@/storefront/catalog';

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return Response.json({ items: [] });
  const items = (await listProducts({ q })).slice(0, 6);
  return Response.json({ items });
}
