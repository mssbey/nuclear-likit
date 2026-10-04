'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts } from '@/store/toast';
import { cn } from '@/lib/utils';

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border border-line-strong bg-surface-2 p-3.5 shadow-lift">
            <Icon
              size={20}
              aria-hidden="true"
              className={cn('mt-0.5 shrink-0', t.kind === 'success' && 'text-accent', t.kind === 'error' && 'text-danger', t.kind === 'info' && 'text-muted')}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="-m-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-fg" aria-label="Bildirimi kapat">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
