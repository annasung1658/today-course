import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getOrCreateRecord, getRecordDetail } from '@/server/record-service';
import { MeetingRecordBoard } from '@/components/meeting-record-board';
import { formatDate } from '@/lib/format';

export default async function MeetingRecordPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?returnTo=/meetings/${meetingId}/record`);
  const record = await getOrCreateRecord(meetingId, session.userId);
  const detail = await getRecordDetail(meetingId, session.userId);
  return <div className="mx-auto max-w-6xl space-y-6"><header><Link href="/meetings" className="text-sm text-ink-400">← 지난 약속</Link><h1 className="mt-3 text-2xl font-extrabold">{detail.title}</h1><p className="mt-1 text-sm text-ink-500">{formatDate(detail.scheduledStartAt)}의 기록</p></header><MeetingRecordBoard recordId={record.id} writable={detail.writable} closesAt={detail.closesAt} photos={detail.photos} posts={detail.generalPosts} /></div>;
}
