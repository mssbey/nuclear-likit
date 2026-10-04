import Image from 'next/image';
import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ürün görseli; görsel yoksa marka renklerinde nötr yer tutucu. */
export function ProductImage({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <div className={cn('grid h-full w-full place-items-center bg-surface-2 text-subtle', className)} role="img" aria-label={`${alt} — görsel yok`}>
        <FlaskConical size={36} aria-hidden="true" />
      </div>
    );
  }
  return (
    <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={cn('object-contain', className)} />
  );
}
