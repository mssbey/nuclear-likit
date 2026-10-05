'use client';

// Kök layout (vitrin menüsü için veritabanı okur) hata verirse devreye girer.

import { ErrorRecovery } from '@/components/ErrorRecovery';

export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, background: '#f6f7f9' }}>
        <title>Yükleniyor…</title>
        <ErrorRecovery {...props} />
      </body>
    </html>
  );
}
