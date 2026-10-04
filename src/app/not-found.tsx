import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page relative flex flex-col items-center py-24 text-center">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(circle_at_center,black,transparent_65%)]" />
      <p className="relative font-display text-[7rem] font-bold leading-none text-accent sm:text-[10rem]">404</p>
      <h1 className="relative mt-4 text-display-sm">Bu sayfa buharlaştı</h1>
      <p className="relative mt-3 max-w-md text-muted">Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.</p>
      <div className="relative mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary">
          Ana sayfa
        </Link>
        <Link href="/urunler" className="btn-secondary">
          Ürünlere göz at
        </Link>
      </div>
    </div>
  );
}
