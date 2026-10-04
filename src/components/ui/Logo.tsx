import { cn } from '@/lib/utils';

/** Radyasyon üçlüsünden türetilmiş işaret + kelime markası (SVG, tema renkleriyle). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('h-8 w-8', className)}>
      <circle cx="16" cy="16" r="15" className="fill-accent" />
      <g className="fill-accent-ink">
        <circle cx="16" cy="16" r="2.6" />
        {[0, 120, 240].map((deg) => (
          <path
            key={deg}
            transform={`rotate(${deg} 16 16)`}
            d="M16 12.2 L11.3 4.1 A13 13 0 0 1 20.7 4.1 Z"
          />
        ))}
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-bold tracking-[0.08em] text-fg">NUCLEAR</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.42em] text-accent">Likit</span>
      </span>
    </span>
  );
}
