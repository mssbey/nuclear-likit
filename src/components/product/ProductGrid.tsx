import type { ProductCardData } from '@/lib/product';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="relative">
          <ProductCard product={p} priority={i < 4} className="h-full" />
        </li>
      ))}
    </ul>
  );
}
