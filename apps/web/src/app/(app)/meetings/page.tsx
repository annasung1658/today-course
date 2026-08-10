import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listMyMeetings } from '@/server/meeting-service';
import { EmptyState } from '@/components/ui';
import { MeetingCard } from '@/components/meeting-card';

export const metadata = { title: '내 약속' };

export default async function MeetingsPage() {
  const session = await getSession();
  if (!session) redirect('/login?returnTo=/meetings');

  const meetings = await listMyMeetings(session.userId);
  const active = meetings.filter((m) => !['COMPLETED', 'CANCELLED'].includes(m.status));
  const past = meetings.filter((m) => ['COMPLETED', 'CANCELLED'].includes(m.status));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">내 약속</h1>
        <Link href="/meetings/new" className="btn-primary">
          약속 만들기
        </Link>
      </div>

      {active.length === 0 ? (
        <EmptyState
          title="진행 중인 약속이 없어요"
          description="약속을 만들면 초대 링크가 생겨요. 카카오톡으로 공유해 보세요."
          action={
            <Link href="/meetings/new" className="btn-primary mt-1">
              약속 만들기
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-500">지난 약속</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
