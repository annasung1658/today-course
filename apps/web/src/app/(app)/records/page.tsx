import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { getCalendar } from '@/server/record-service';
import { RecordsCalendarGallery } from '@/components/records-calendar-gallery';

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
  return <RecordsCalendarGallery calendar={calendar} />;
}
