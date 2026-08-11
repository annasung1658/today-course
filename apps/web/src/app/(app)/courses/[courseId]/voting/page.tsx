import Link from 'next/link';
import { redirect } from 'next/navigation';
import { VotingBoard } from '@/components/voting-board';
import { getSession } from '@/lib/auth/session';
import { getVotingState } from '@/server/voting-service';
import { env } from '@/lib/env';

// 투표 상태는 매 요청마다 서버 시간과 함께 새로 읽어야 한다.
export const dynamic = 'force-dynamic';

export const metadata = { title: '코스 투표' };

export default async function VotingPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?returnTo=/courses/${courseId}/voting`);

  const state = await getVotingState(courseId, session.userId);
  const confirmed = state.status === 'CLOSED';

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/meetings/${state.meetingId}`} className="text-sm text-ink-500 hover:text-ink-900">
          ← {state.meetingTitle}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{state.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{state.summary}</p>
        {confirmed && (
          <p className="mt-3 rounded-lg bg-good-100 px-3 py-2.5 text-sm font-medium text-good-600">
            투표가 끝나 이 코스로 확정됐어요.
          </p>
        )}
      </div>

      <VotingBoard initialState={state as never} kakaoJsKey={env.KAKAO_JS_KEY ?? null} />
    </div>
  );
}
