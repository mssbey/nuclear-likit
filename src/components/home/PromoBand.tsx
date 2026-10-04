import Link from 'next/link';
import { ArrowRight, Percent } from 'lucide-react';

/** Kampanya bandı — sarı-siyah uyarı şeridi motifiyle. */
export function PromoBand({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <section aria-label="Kampanyalar" className="container-page py-6">
      <Link
        href="/kampanyalar"
        className="group relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-hazard/40 bg-surface p-7 sm:flex-row sm:items-center sm:justify-between sm:p-10"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1/3 opacity-[0.13] [background:repeating-linear-gradient(-45deg,theme(colors.hazard.DEFAULT)_0_18px,transparent_18px_36px)] [mask-image:linear-gradient(to_left,black,transparent)]"
        />
        <span className="relative flex items-center gap-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-hazard text-black">
            <Percent size={28} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-hazard">Kampanya</span>
            <span className="mt-1 block font-display text-2xl font-semibold sm:text-3xl">İndirimli {count} ürün seni bekliyor</span>
          </span>
        </span>
        <span className="btn relative bg-hazard text-black hover:bg-hazard/90">
          Fırsatları gör <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Link>
    </section>
  );
}
