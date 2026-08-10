'use client';

import { useState } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

/** 초대 링크를 만들고 클립보드에 복사한다. 카카오톡으로 붙여넣으면 카드가 뜬다. */
export function InviteLink({ meetingId }: { meetingId: string }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ inviteUrl: string }>(`/meetings/${meetingId}/invitations`, {
        method: 'POST',
      });
      setInviteUrl(result.inviteUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '초대 링크를 만들지 못했어요.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      {error && <ErrorNotice message={error} />}
      {inviteUrl ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input readOnly value={inviteUrl} className="field flex-1 text-ink-500" aria-label="초대 링크" />
          <button type="button" onClick={copy} className="btn-primary shrink-0">
            {copied ? '복사했어요' : '링크 복사'}
          </button>
        </div>
      ) : (
        <button type="button" onClick={create} className="btn-primary" disabled={loading}>
          {loading ? '만드는 중' : '초대 링크 만들기'}
        </button>
      )}
    </div>
  );
}
