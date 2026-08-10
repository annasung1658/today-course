import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getMyInterview } from '@/server/interview-service';
import { InterviewChat } from '@/components/interview-chat';

export const metadata = { title: '취향 알려주기' };

export default async function InterviewPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?returnTo=/meetings/${meetingId}/interview`);

  // 아직 시작하지 않았으면 null을 넘겨 시작 화면을 보여준다.
  const interview = await getMyInterview(meetingId, session.userId).catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">취향 알려주기</h1>
        <p className="mt-1 text-sm text-ink-500">답변은 나만 볼 수 있어요. 방장에게도 응답 여부만 보여요.</p>
      </div>
      <InterviewChat meetingId={meetingId} initial={interview as never} />
    </div>
  );
}
