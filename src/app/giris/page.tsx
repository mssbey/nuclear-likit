import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/server/customers/auth';
import { LoginForm } from '@/components/account/AuthForm';

export const metadata: Metadata = { title: 'Giriş yap', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentCustomer()) redirect('/hesabim');
  return (
    <div className="container-page flex justify-center py-14">
      <div className="card w-full max-w-md p-7 sm:p-8">
        <h1 className="text-display-sm">Giriş yap</h1>
        <p className="mt-2 text-sm text-muted">Siparişlerini ve adreslerini görmek için giriş yap.</p>
        <div className="mt-7">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
