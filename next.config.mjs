/** @type {import('next').NextConfig} */
const mediaHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? 'https://mixle.net').hostname;
  } catch {
    return 'mixle.net';
  }
})();

const dev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // iyzipay kaynak modellerini çalışma anında dizinden okur (Mixle ile aynı).
  serverExternalPackages: ['iyzipay'],
  images: {
    formats: ['image/avif', 'image/webp'],
    // Ürün görselleri panelden Vercel Blob'a yüklenir; eski/yerel yollar Mixle alan adından gelir.
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: mediaHost },
      // Yerel geliştirmede görseller localhost'taki Mixle'dan gelir.
      ...(dev ? [{ protocol: 'http', hostname: 'localhost' }] : []),
    ],
    // Next 16 yerel IP'ye görsel isteğini SSRF'e karşı engeller; yalnız geliştirmede aç.
    dangerouslyAllowLocalIP: dev,
  },
};

export default nextConfig;
