import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ensureDefaultLegalDocuments, getCurrentLegal, LEGAL_KINDS, legalKindLabels, type LegalKind } from '@/server/legal/documents';
import { fillLegal } from '@/lib/legal-fill';
import { getStoreInfo, getStoreSettings } from '@/server/settings';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

type Params = Promise<{ kind: string }>;

const isKind = (k: string): k is LegalKind => (LEGAL_KINDS as readonly string[]).includes(k);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { kind } = await params;
  return isKind(kind) ? { title: legalKindLabels[kind], alternates: { canonical: `/yasal/${kind}` } } : { title: 'Bulunamadı' };
}

export default async function LegalPage({ params }: { params: Params }) {
  const { kind } = await params;
  if (!isKind(kind)) notFound();

  await ensureDefaultLegalDocuments();
  const [doc, info, settings] = await Promise.all([getCurrentLegal(kind), getStoreInfo(), getStoreSettings()]);
  // Siparişe özgü yer tutucular burada boş kalır ("—"); sipariş anında doldurulur.
  const body = fillLegal(doc.body, {
    saticiUnvan: info.legalName,
    saticiAdres: [info.address, info.city].filter(Boolean).join(', '),
    saticiTelefon: info.phone,
    saticiEposta: info.email,
    saticiVergi: [info.taxOffice, info.taxNumber].filter(Boolean).join(' / '),
    caymaGun: settings.withdrawalDays,
  });

  return (
    <div className="container-page max-w-3xl pb-6 pt-8">
      <Breadcrumbs items={[{ label: legalKindLabels[kind] }]} />
      <h1 className="mt-6 text-display-md">{doc.title}</h1>
      <p className="mt-2 text-xs text-subtle">Sürüm {doc.version}</p>
      <pre className="card mt-8 whitespace-pre-wrap p-6 font-sans text-sm leading-7 text-muted sm:p-8">{body}</pre>
    </div>
  );
}
