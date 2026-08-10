'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

export function InviteActions({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ meetingId: string }>(`/invitations/${inviteCode}/accept`, {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
      });
      router.push(`/meetings/${result.meetingId}/interview`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '참여하지 못했습니다.');
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await apiFetch(`/invitations/${inviteCode}/decline`, { method: 'POST' });
      router.push('/meetings');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '처리하지 못했습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && <ErrorNotice message={error} />}
      <button type="button" onClick={accept} className="btn-primary w-full" disabled={busy}>
        참여하기
      </button>
      <button type="button" onClick={decline} className="btn-ghost w-full" disabled={busy}>
        이번엔 어려워요
      </button>
    </div>
  );
}
