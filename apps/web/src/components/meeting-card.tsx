'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeetingSummary } from '@/server/meeting-service';
import { formatDateTime, meetingStatusLabels } from '@/lib/format';
import { StatusChip } from '@/components/ui';
import { apiFetch, ApiClientError } from '@/lib/api-client';

const toneByStatus: Record<string, 'neutral' | 'accent' | 'good' | 'danger'> = {
  VOTING: 'accent',
  GENERATING: 'accent',
  CONFIRMED: 'good',
  GENERATION_FAILED: 'danger',
  CANCELLED: 'danger',
};

export function MeetingCard({ meeting }: { meeting: MeetingSummary }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href =
    meeting.status === 'COMPLETED'
      ? `/meetings/${meeting.id}/record`
      : meeting.status === 'VOTING' && meeting.currentCourse
      ? `/courses/${meeting.currentCourse.courseId}/voting`
      : `/meetings/${meeting.id}`;

  const remove = async () => {
    const message = meeting.isHost
      ? '이 약속을 정말 삭제할까요? 모든 참여자의 사진, 글, 댓글도 함께 삭제되며 되돌릴 수 없어요.'
      : '내 약속 목록에서 이 방을 지울까요? 다른 참여자의 방과 기록은 그대로 유지돼요.';
    if (!window.confirm(message)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/meetings/${meeting.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '약속을 삭제하지 못했어요.');
      setDeleting(false);
    }
  };

  return (
    <article className="card card-interactive group relative overflow-hidden">
      <Link href={href} className="block p-5 pr-24">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate font-bold tracking-tight transition-colors group-hover:text-accent-700">{meeting.title}</h3>
      </div>
      <p className="mt-1.5 text-sm text-ink-500">{formatDateTime(meeting.scheduledStartAt)}</p>
      <p className="mt-0.5 text-sm text-ink-500">
        {meeting.areaName} · {meeting.participantCount}/{meeting.capacity}명
        {meeting.isHost && ' · 내가 만든 약속'}
      </p>
      </Link>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <StatusChip tone={toneByStatus[meeting.status] ?? 'neutral'}>
          {meetingStatusLabels[meeting.status] ?? meeting.status}
        </StatusChip>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="rounded-lg px-2 py-1 text-xs font-bold text-red-500 opacity-70 transition hover:bg-red-50 hover:opacity-100 disabled:opacity-40"
          aria-label={meeting.isHost ? `${meeting.title} 방 삭제` : `${meeting.title} 내 목록에서 삭제`}
        >
          {deleting ? '삭제 중' : meeting.isHost ? '방 삭제' : '목록 삭제'}
        </button>
      </div>
      {error && <p className="border-t border-red-100 bg-red-50 px-5 py-2 text-xs text-red-600">{error}</p>}
    </article>
  );
}
