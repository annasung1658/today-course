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

export function MeetingCard({ meeting }: { meeting: MeetingSummary }) {
  const href =
    meeting.status === 'VOTING' && meeting.currentCourse
      ? `/courses/${meeting.currentCourse.courseId}/voting`
      : `/meetings/${meeting.id}`;

  return (
    <Link href={href} className="card block p-4 transition-colors hover:border-ink-200 hover:bg-ink-50">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate font-semibold tracking-tight">{meeting.title}</h3>
        <StatusChip tone={toneByStatus[meeting.status] ?? 'neutral'}>
          {meetingStatusLabels[meeting.status] ?? meeting.status}
        </StatusChip>
      </div>
      <p className="mt-1.5 text-sm text-ink-500">{formatDateTime(meeting.scheduledStartAt)}</p>
      <p className="mt-0.5 text-sm text-ink-500">
        {meeting.areaName} · {meeting.participantCount}/{meeting.capacity}명
        {meeting.isHost && ' · 내가 만든 약속'}
      </p>
    </Link>
  );
}
