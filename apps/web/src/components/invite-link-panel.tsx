'use client';

import { useState } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

/** 방장이 초대 링크를 만들고 복사한다. 카카오톡에 붙여넣으면 미리보기 카드가 뜬다. */
export function InviteLinkPanel({ meetingId }: { meetingId: string }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ inviteUrl: string }>(`/meetings/${meetingId}/invitations`, {
        method: 'POST',
      });
      setInviteUrl(result.inviteUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '초대 링크를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card p-5">
      <h2 className="text-sm font-bold tracking-tight">초대 링크</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        링크를 받은 사람은 약속 정보를 먼저 보고 참여할지 정할 수 있어요.
      </p>

      {error && <div className="mt-3"><ErrorNotice message={error} /></div>}

      {inviteUrl ? (
        <div className="mt-4 space-y-2">
          <input readOnly value={inviteUrl} className="field text-xs" onFocus={(e) => e.target.select()} />
          <button type="button" onClick={copy} className="btn-primary w-full">
            {copied ? '복사했어요' : '링크 복사'}
          </button>
        </div>
      ) : (
        <button type="button" onClick={create} className="btn-primary mt-4 w-full" disabled={busy}>
          {busy ? '만드는 중' : '초대 링크 만들기'}
        </button>
      )}
    </div>
  );
}
