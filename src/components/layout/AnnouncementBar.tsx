import { Zap } from 'lucide-react';
import { site } from '@/lib/site';

/** Kayan duyuru bandı. Hareket azaltma tercihinde animasyon durur (globals.css). */
export function AnnouncementBar() {
  const items = [...site.announcements, ...site.announcements];
  return (
    <div className="overflow-hidden border-b border-line bg-surface text-xs text-muted">
      <p className="sr-only">{site.announcements.join('. ')}</p>
      <div className="flex w-max animate-marquee gap-10 py-2.5" aria-hidden="true">
        {items.map((text, i) => (
          <span key={i} className="inline-flex items-center gap-2 whitespace-nowrap">
            <Zap size={13} className="text-accent" />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
