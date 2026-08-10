import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { listMyMeetings } from '@/server/meeting-service';
import { EmptyState, SectionHeading } from '@/components/ui';
import { MeetingCard } from '@/components/meeting-card';

export default async function HomePage() {
  const session = await getSession();
  if (!session) return <Landing />;

  const meetings = await listMyMeetings(session.userId);
  const now = Date.now();

  const needsMyResponse = meetings.filter(
    (m) =>
      ['INVITING', 'COLLECTING_RESPONSES'].includes(m.status) &&
      m.myStatus !== 'INTERVIEW_COMPLETED' &&
      new Date(m.responseDeadlineAt).getTime() > now,
  );
  const voting = meetings.filter((m) => m.status === 'VOTING');
  const upcoming = meetings.filter((m) => m.status === 'CONFIRMED');

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">안녕하세요, {session.nickname}님</h1>
        <p className="mt-1 text-sm text-ink-500">지금 확인할 약속을 먼저 보여드려요.</p>
      </div>

      {voting.length > 0 && (
        <section>
          <SectionHeading title="투표 중" description="코스가 나왔어요. 마음에 안 드는 곳에 싫어요를 눌러주세요." />
          <div className="grid gap-3 sm:grid-cols-2">
            {voting.map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        </section>
      )}

      {needsMyResponse.length > 0 && (
        <section>
          <SectionHeading title="내 취향을 기다리고 있어요" description="응답 마감 전에 알려주세요." />
          <div className="grid gap-3 sm:grid-cols-2">
            {needsMyResponse.map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeading title="다가오는 약속" />
        {upcoming.length === 0 ? (
          <EmptyState
            title="예정된 약속이 없어요"
            description="약속을 만들고 친구를 초대하면, 모두의 취향을 모아 코스를 추천해 드려요."
            action={
              <Link href="/meetings/new" className="btn-primary mt-1">
                약속 만들기
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** 로그아웃 상태에서 보이는 소개 화면. */
function Landing() {
  return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
        약속은 잡았는데,
        <br />
        어디 갈지는 늘 미정이었죠
      </h1>
      <p className="mt-5 text-base leading-relaxed text-ink-500">
        참여자마다 AI와 따로 이야기하면, 취향을 모아 하나의 코스를 만들어요.
        <br className="hidden sm:block" />
        단체 채팅에서 눈치 보지 않아도 됩니다.
      </p>

      <div className="mt-8 flex justify-center gap-2">
        <Link href="/signup" className="btn-primary">
          시작하기
        </Link>
        <Link href="/login" className="btn-secondary">
          로그인
        </Link>
      </div>

      <ol className="mt-14 space-y-4 text-left">
        {[
          ['약속을 만들고 링크를 공유해요', '날짜·지역·인원만 정하면 돼요.'],
          ['각자 AI와 따로 이야기해요', '다른 사람에게는 응답 여부만 보여요.'],
          ['코스 하나를 받아요', '싫어요가 과반수인 곳만 다시 골라드려요.'],
        ].map(([title, description], index) => (
          <li key={title} className="card flex gap-4 p-5">
            <span className="tnum text-sm font-bold text-ink-300">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-0.5 text-sm text-ink-500">{description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
