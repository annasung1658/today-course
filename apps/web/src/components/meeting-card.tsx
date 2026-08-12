'use client';

import Link from 'next/link';
import type { MeetingSummary } from '@/server/meeting-service';
import { formatDateTime, meetingStatusLabels } from '@/lib/format';
import { StatusChip } from '@/components/ui';

const toneByStatus: Record<string, 'neutral' | 'accent' | 'good' | 'danger'> = {
  VOTING: 'accent',
  GENERATING: 'accent',
  CONFIRMED: 'good',
  GENERATION_FAILED: 'danger',
  CANCELLED: 'danger',
};

export function MeetingCard({ meeting, selectionMode = false, selected = false, onSelect }: { meeting: MeetingSummary; selectionMode?: boolean; selected?: boolean; onSelect?: () => void }) {
  const href =
    meeting.status === 'COMPLETED'
      ? `/meetings/${meeting.id}/record`
      : meeting.status === 'VOTING' && meeting.currentCourse
      ? `/courses/${meeting.currentCourse.courseId}/voting`
      : `/meetings/${meeting.id}`;

  return (
    <article className={`card card-interactive group relative overflow-hidden ${selected ? 'ring-2 ring-accent-400' : ''}`}>
      {selectionMode ? (
        <button type="button" onClick={onSelect} className="block w-full cursor-pointer p-5 pr-24 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500" aria-pressed={selected} aria-label={`${meeting.title} ${selected ? '선택 해제' : '삭제 대상으로 선택'}`}>
          <CardContents meeting={meeting} />
        </button>
      ) : (
        <Link href={href} className="block p-5 pr-24"><CardContents meeting={meeting} /></Link>
      )}
      <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2" aria-hidden={selectionMode || undefined}>
        <StatusChip tone={toneByStatus[meeting.status] ?? 'neutral'}>{meetingStatusLabels[meeting.status] ?? meeting.status}</StatusChip>
        {selectionMode && <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-black ${selected ? 'border-accent-500 bg-accent-500 text-white' : 'border-ink-200 bg-white text-transparent'}`}>✓</span>}
      </div>
    </article>
  );
}

function CardContents({ meeting }: { meeting: MeetingSummary }) {
  return <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate font-bold tracking-tight transition-colors group-hover:text-accent-700">{meeting.title}</h3>
      </div>
      <p className="mt-1.5 text-sm text-ink-500">{formatDateTime(meeting.scheduledStartAt)}</p>
      <p className="mt-0.5 text-sm text-ink-500">
        {meeting.areaName} · {meeting.participantCount}/{meeting.capacity}명
        {meeting.isHost && ' · 내가 만든 약속'}
      </p>
    </>;
}
