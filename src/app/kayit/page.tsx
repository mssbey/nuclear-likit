import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/server/customers/auth';
import { RegisterForm } from '@/components/account/AuthForm';

export const metadata: Metadata = { title: 'Kayıt ol', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; eposta?: string }> }) {
  const { next, eposta } = await searchParams;
  if (await getCurrentCustomer()) redirect('/hesabim');
  return (
    <div className="container-page flex justify-center py-14">
      <div className="card w-full max-w-lg p-7 sm:p-8">
        <h1 className="text-display-sm">Hesap oluştur</h1>
        <p className="mt-2 text-sm text-muted">Misafir olarak verdiğin siparişler aynı e-postayla hesabına bağlanır.</p>
        <div className="mt-7">
          <RegisterForm next={next} initialEmail={eposta} />
        </div>
      </div>
    </div>
  );
}
