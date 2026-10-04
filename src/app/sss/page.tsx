import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { getFaqContent } from '@/server/content/settings';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Sıkça sorulan sorular', alternates: { canonical: '/sss' } };

export default async function FaqPage() {
  const { groups } = await getFaqContent();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((g) => g.items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } }))),
  };

  return (
    <div className="container-page max-w-3xl pb-6 pt-8">
      <Breadcrumbs items={[{ label: 'SSS' }]} />
      <h1 className="mt-6 text-display-md">Sıkça sorulan sorular</h1>
      {groups.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={HelpCircle}
          title="Sorular hazırlanıyor"
          description="Aklına takılan bir şey varsa bize yaz."
          action={
            <Link href="/iletisim" className="btn-primary">
              İletişime geç
            </Link>
          }
        />
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map((g) => (
            <section key={g.heading} aria-label={g.heading}>
              <h2 className="text-xl">{g.heading}</h2>
              <div className="card mt-4 divide-y divide-line">
                {g.items.map((i) => (
                  <details key={i.q} className="group px-5">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium">
                      {i.q}
                      <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="pb-4 text-sm leading-7 text-muted">{i.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {groups.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
    </div>
  );
}
