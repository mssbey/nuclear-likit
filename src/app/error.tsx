'use client';

import { ErrorRecovery } from '@/components/ErrorRecovery';

export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorRecovery {...props} />;
}
