import { BadgeCheck, CreditCard, PackageCheck, Truck } from 'lucide-react';

const ITEMS = [
  { icon: BadgeCheck, title: 'Orijinal ürün', text: 'Tüm ürünler orijinal kutusunda, faturalı olarak gönderilir.' },
  { icon: Truck, title: 'Hızlı kargo', text: 'Siparişler 1–3 iş günü içinde kargoya verilir.' },
  { icon: PackageCheck, title: 'Sızdırmaz paket', text: 'Darbe emici, gizli ve sızdırmaz çift katman paketleme.' },
  { icon: CreditCard, title: 'Güvenli ödeme', text: '3D Secure kart, havale/EFT ve kapıda ödeme seçenekleri.' },
];

export function ValueProps() {
  return (
    <section aria-label="Neden Nuclear Likit" className="container-page py-12">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="card flex gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>
              <span className="block font-display font-semibold">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
