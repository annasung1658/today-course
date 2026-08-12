import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { listMyMeetings } from '@/server/meeting-service';
import { EmptyState, SectionHeading } from '@/components/ui';
import { MeetingCard } from '@/components/meeting-card';
import { BrandLogo } from '@/components/brand-logo';

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
  const generating = meetings.filter((m) => m.status === 'GENERATING');
  const generationFailed = meetings.filter((m) => m.status === 'GENERATION_FAILED');
  const upcoming = meetings.filter((m) => m.status === 'CONFIRMED');

  return (
    <div className="space-y-12">
      <div className="relative overflow-hidden rounded-[2rem] bg-accent-600 px-6 py-8 text-white shadow-[0_18px_44px_rgba(47,146,229,.22)] sm:px-9">
        <div className="absolute -right-5 -top-7 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute bottom-3 right-24 h-10 w-10 rounded-full bg-white/10" />
        <p className="relative text-sm font-semibold text-white/75">오늘도 반가워요 👋</p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{session.nickname}님의 약속</h1>
        <p className="relative mt-2 text-sm text-white/80">지금 확인할 코스와 약속을 먼저 모아뒀어요.</p>
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

      {generating.length > 0 && (
        <section>
          <SectionHeading title="AI가 코스를 만들고 있어요" description="취향을 모아 어울리는 장소를 찾고 있어요." />
          <div className="grid gap-3 sm:grid-cols-2">
            {generating.map((m) => <MeetingCard key={m.id} meeting={m} />)}
          </div>
        </section>
      )}

      {generationFailed.length > 0 && (
        <section>
          <SectionHeading title="코스 생성을 다시 확인해 주세요" description="방장이 약속방에서 코스 생성을 다시 시도할 수 있어요." />
          <div className="grid gap-3 sm:grid-cols-2">
            {generationFailed.map((m) => <MeetingCard key={m.id} meeting={m} />)}
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
    <div className="relative mx-auto max-w-3xl py-10 text-center sm:py-16">
      <BrandLogo size={88} priority decorative className="animate-float mx-auto mb-6 shadow-lift" />
      <span className="chip border-accent-100 bg-white text-accent-700 shadow-sm">AI가 취향을 모아 코스로</span>
      <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-[-0.04em] sm:text-6xl">
        약속은 잡았는데,
        <br />
        어디 갈지는 <span className="text-accent-600">늘 미정</span>이었죠
      </h1>
      <p className="mt-5 text-base leading-relaxed text-ink-500">
        참여자마다 AI와 따로 이야기하면, 취향을 모아 하나의 코스를 만들어요.
        <br className="hidden sm:block" />
        단체 채팅에서 눈치 보지 않아도 됩니다.
      </p>

      <div className="mt-9 flex justify-center gap-3">
        <Link href="/signup" className="btn-primary">
          시작하기
        </Link>
        <Link href="/login" className="btn-secondary">
          로그인
        </Link>
      </div>

      <ol className="mt-16 grid gap-4 text-left sm:grid-cols-3">
        {[
          ['약속을 만들고 링크를 공유해요', '날짜·지역·인원만 정하면 돼요.'],
          ['각자 AI와 따로 이야기해요', '다른 사람에게는 응답 여부만 보여요.'],
          ['코스 하나를 받아요', '싫어요가 과반수인 곳만 다시 골라드려요.'],
        ].map(([title, description], index) => (
          <li key={title} className="card card-interactive flex flex-col gap-4 p-6">
            <span className="tnum flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-sm font-extrabold text-accent-600">{index + 1}</span>
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
