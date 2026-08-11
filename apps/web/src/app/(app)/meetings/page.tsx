import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listMyMeetings } from '@/server/meeting-service';
import { MeetingList } from '@/components/meeting-list';

export const metadata = { title: '내 약속' };

export default async function MeetingsPage() {
  const session = await getSession();
  if (!session) redirect('/login?returnTo=/meetings');

  const meetings = await listMyMeetings(session.userId);
  return <MeetingList meetings={meetings} />;
}
