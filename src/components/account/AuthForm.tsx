'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { accountApi, CheckoutApiError } from '@/lib/checkout-client';

/** Yalnız site içi göreli yollara dönülür (açık yönlendirme engeli). */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/hesabim';
}

function PasswordField({ id, value, onChange, autoComplete, error }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="field-label">
        Parola
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="field pr-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <button type="button" className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg" onClick={() => setShow((s) => !s)} aria-label={show ? 'Parolayı gizle' : 'Parolayı göster'}>
          {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await accountApi.login(email, password);
      router.replace(safeNext(next));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="li-email" className="field-label">
          E-posta
        </label>
        <input id="li-email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <PasswordField id="li-pass" value={password} onChange={setPassword} autoComplete="current-password" />
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ''}
      </p>
      <button type="submit" className="btn-primary h-12 w-full" disabled={busy}>
        {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />} Giriş yap
      </button>
      <p className="text-center text-sm text-muted">
        Hesabın yok mu?{' '}
        <Link href={`/kayit${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
          Kayıt ol
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next, initialEmail }: { next?: string; initialEmail?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: initialEmail ?? '', phone: '', password: '', kvkkAccepted: false, marketingOptIn: false });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setIssues({});
    try {
      await accountApi.register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
        marketingOptIn: form.marketingOptIn,
        kvkkAccepted: form.kvkkAccepted,
      });
      router.replace(safeNext(next));
      router.refresh();
    } catch (err) {
      if (err instanceof CheckoutApiError) setIssues(err.issues);
      setError(err instanceof Error ? err.message : 'Kayıt yapılamadı');
      setBusy(false);
    }
  };

  const field = (k: 'firstName' | 'lastName' | 'email' | 'phone', label: string, type = 'text', autoComplete?: string) => (
    <div>
      <label htmlFor={`rg-${k}`} className="field-label">
        {label}
      </label>
      <input
        id={`rg-${k}`}
        type={type}
        autoComplete={autoComplete}
        className="field"
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        required={k !== 'phone'}
        aria-invalid={issues[k] ? true : undefined}
        aria-describedby={issues[k] ? `rg-${k}-err` : undefined}
      />
      {issues[k] && (
        <p id={`rg-${k}-err`} className="field-error">
          {issues[k]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('firstName', 'Ad', 'text', 'given-name')}
        {field('lastName', 'Soyad', 'text', 'family-name')}
      </div>
      {field('email', 'E-posta', 'email', 'email')}
      {field('phone', 'Cep telefonu (isteğe bağlı)', 'tel', 'tel')}
      <div>
        <PasswordField id="rg-pass" value={form.password} onChange={(v) => set('password', v)} autoComplete="new-password" error={issues.password} />
        {!issues.password && <p className="field-hint">En az 10 karakter; harf ve rakam içermeli.</p>}
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B6FF3B]" checked={form.kvkkAccepted} onChange={(e) => set('kvkkAccepted', e.target.checked)} />
        <span>
          <Link href="/yasal/kvkk-aydinlatma" className="link" target="_blank">
            KVKK aydınlatma metnini
          </Link>{' '}
          okudum. <span className="text-danger">*</span>
          {issues.kvkkAccepted && <span className="field-error block">{issues.kvkkAccepted}</span>}
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B6FF3B]" checked={form.marketingOptIn} onChange={(e) => set('marketingOptIn', e.target.checked)} />
        Kampanyalardan e-posta ile haberdar olmak istiyorum (isteğe bağlı).
      </label>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ''}
      </p>
      <button type="submit" className="btn-primary h-12 w-full" disabled={busy}>
        {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />} Hesap oluştur
      </button>
      <p className="text-center text-sm text-muted">
        Zaten hesabın var mı?{' '}
        <Link href={`/giris${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
          Giriş yap
        </Link>
      </p>
    </form>
  );
}
