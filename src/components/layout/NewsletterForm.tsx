'use client';

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: 'busy' });
    try {
      const res = await fetch('/api/abonelik', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'eposta', email }),
      });
      const body = (await res.json()) as { message?: string; issues?: Record<string, string> };
      if (!res.ok) throw new Error(Object.values(body.issues ?? {})[0] ?? body.message ?? 'Kayıt yapılamadı');
      setState({ kind: 'ok', message: body.message });
      setEmail('');
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Kayıt yapılamadı' });
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <label htmlFor="nl-email" className="sr-only">
        E-posta adresin
      </label>
      <div className="flex gap-2">
        <input
          id="nl-email"
          type="email"
          required
          autoComplete="email"
          placeholder="E-posta adresin"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
          aria-invalid={state.kind === 'error' || undefined}
          aria-describedby="nl-status"
        />
        <button type="submit" className="btn-primary shrink-0 px-4" disabled={state.kind === 'busy'} aria-label="Bültene kaydol">
          {state.kind === 'busy' ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </div>
      <p id="nl-status" role="status" className={state.kind === 'error' ? 'field-error' : 'field-hint'}>
        {state.message ?? 'Yeni ürünler ve kampanyalar. İstediğin zaman ayrılabilirsin.'}
      </p>
    </form>
  );
}
