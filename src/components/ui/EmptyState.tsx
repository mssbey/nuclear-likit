import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line-strong bg-surface-2 text-accent">
        <Icon size={26} aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
