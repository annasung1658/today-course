import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getCalendar } from '@/server/record-service';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: '지난 기록' };
export const dynamic = 'force-dynamic';

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { year: yearParam, month: monthParam } = await searchParams;
  const now = new Date();
  const year = Number(yearParam ?? now.getUTCFullYear());
  const month = Number(monthParam ?? now.getUTCMonth() + 1);

  const calendar = await getCalendar(session.userId, year, month);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return (
      <div className="space-y-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">
            {year}년 {month}월
          </h1>
          <div className="flex gap-1">
            <Link href={`/records?year=${prev.year}&month=${prev.month}`} className="btn-secondary px-3">
              이전 달
            </Link>
            <Link href={`/records?year=${next.year}&month=${next.month}`} className="btn-secondary px-3">
              다음 달
            </Link>
          </div>
        </div>

        {calendar.dates.length === 0 ? (
          <EmptyState
            title="이 달에는 기록이 없어요"
            description="약속이 끝나면 사진과 후기를 남길 수 있어요."
            action={
              <Link href="/meetings" className="btn-secondary mt-1">
                내 약속 보기
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {calendar.dates.map((date) => (
              <li key={date.date}>
                <p className="mb-2 text-sm font-semibold text-ink-500">{formatDate(`${date.date}T00:00:00Z`)}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {(date.records as Array<Record<string, string | null>>).map((record) => (
                    <li key={String(record.meetingId)}>
                      <Link
                        href={`/meetings/${record.meetingId}`}
                        className="card block p-4 transition-colors hover:border-ink-200 hover:bg-ink-50"
                      >
                        <p className="font-semibold">{record.title}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
  );
}
