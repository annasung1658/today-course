import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getMeetingDetail } from '@/server/meeting-service';
import { formatDate, formatDateTime, formatTime, meetingStatusLabels, participantStatusLabels } from '@/lib/format';
import { SectionHeading, StatusChip } from '@/components/ui';
import { InviteLink } from '@/components/invite-link';
import { CourseGenerationButton, GeneratingWatcher } from '@/components/course-generation-button';
import { MeetingHostActions } from '@/components/meeting-host-actions';
import { CourseSummaryShare } from '@/components/course-summary-share';
import { getSharedCourseSummary } from '@/server/course-share-service';
import { env } from '@/lib/env';

interface PageProps {
  params: Promise<{ meetingId: string }>;
}

export default async function MeetingDetailPage({ params }: PageProps) {
  const { meetingId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?returnTo=/meetings/${meetingId}`);

  const meeting = (await getMeetingDetail(meetingId, session.userId)) as Awaited<
    ReturnType<typeof getMeetingDetail>
  >;

  const myParticipant = meeting.participants.find((p) => p.isMe);
  const submitted = meeting.participants.filter((p) => p.status === 'INTERVIEW_COMPLETED').length;
  const total = meeting.participants.filter((p) => p.status !== 'DECLINED').length;
  const needsMyResponse = myParticipant?.status !== 'INTERVIEW_COMPLETED';
  const confirmedCourse = meeting.currentCourse?.status === 'CONFIRMED'
    ? await getSharedCourseSummary(meeting.currentCourse.courseId)
    : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={meeting.status === 'VOTING' ? 'accent' : 'neutral'}>
            {meetingStatusLabels[meeting.status] ?? meeting.status}
          </StatusChip>
          {meeting.isHost && <StatusChip>내가 만든 약속</StatusChip>}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{meeting.title}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {formatDate(meeting.scheduledStartAt)} · {formatTime(meeting.scheduledStartAt)}–
          {formatTime(meeting.scheduledEndAt)} · {meeting.area.name}
        </p>
        <MeetingHostActions isHost={meeting.isHost} meeting={{ id: meeting.id, title: meeting.title, capacity: meeting.capacity, specialNotes: meeting.specialNotes }} />
      </header>

      {meeting.recordAccess.available && meeting.status !== 'CANCELLED' && (
        <div className="card border-accent-100 bg-gradient-to-r from-accent-50 to-white p-5">
          <p className="font-semibold">함께 남긴 약속 기록</p>
          <p className="mt-1 text-sm text-ink-500">사진과 글을 한곳에서 보고, 참여자들과 댓글을 나눠보세요.</p>
          <Link href={`/meetings/${meeting.id}/record`} className="btn-primary mt-3">사진·글 기록 열기</Link>
        </div>
      )}

      {meeting.currentCourse && meeting.status === 'VOTING' && (
        <div className="card border-accent-100 bg-accent-50 p-5">
          <p className="font-semibold text-accent-700">코스가 나왔어요</p>
          <p className="mt-1 text-sm text-accent-700">
            {formatDateTime(meeting.currentCourse.votingEndsAt)}까지 투표할 수 있어요.
          </p>
          <Link href={`/courses/${meeting.currentCourse.courseId}/voting`} className="btn-primary mt-3">
            투표하러 가기
          </Link>
        </div>
      )}

      {meeting.currentCourse && confirmedCourse && meeting.status !== 'CANCELLED' && (
        <div className="card p-5">
          <p className="font-semibold">코스가 확정됐어요</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/courses/${meeting.currentCourse.courseId}/voting`} className="btn-secondary mt-3">
              확정된 코스 보기
            </Link>
            <CourseSummaryShare course={confirmedCourse} kakaoJsKey={env.KAKAO_JS_KEY ?? null} />
          </div>
        </div>
      )}

      {needsMyResponse && ['INVITING', 'COLLECTING_RESPONSES'].includes(meeting.status) && (
        <div className="card p-5">
          <p className="font-semibold">아직 취향을 알려주지 않았어요</p>
          <p className="mt-1 text-sm text-ink-500">
            {formatDateTime(meeting.responseDeadlineAt)}까지 답해주세요. 답변은 나만 볼 수 있어요.
          </p>
          <Link href={`/meetings/${meeting.id}/interview`} className="btn-primary mt-3">
            취향 알려주기
          </Link>
        </div>
      )}

      {meeting.isHost && ['INVITING', 'COLLECTING_RESPONSES'].includes(meeting.status) && (
        <section>
          <SectionHeading title="친구 초대하기" description="링크를 받은 사람은 로그인 후 참여할 수 있어요." />
          <InviteLink meetingId={meeting.id} />
        </section>
      )}

      {meeting.isHost && ['INVITING', 'COLLECTING_RESPONSES'].includes(meeting.status) && submitted > 0 && (
        <CourseGenerationButton meetingId={meeting.id} allResponded={submitted === total} />
      )}

      {meeting.status === 'GENERATING' && <GeneratingWatcher meetingId={meeting.id} />}

      {meeting.status === 'GENERATION_FAILED' && meeting.isHost && (
        <CourseGenerationButton meetingId={meeting.id} allResponded={submitted === total} />
      )}

      <section>
        <SectionHeading
          title="참여자"
          description={`${total}명 중 ${submitted}명이 취향을 알려줬어요. 답변 내용은 본인만 볼 수 있어요.`}
        />
        <ul className="card divide-y divide-ink-100">
          {meeting.participants.map((participant) => (
            <li key={participant.participantId} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="truncate text-sm font-medium">
                {participant.nickname}
                {participant.role === 'HOST' && <span className="ml-1.5 text-xs text-ink-300">방장</span>}
                {participant.isMe && <span className="ml-1.5 text-xs text-ink-300">나</span>}
              </span>
              <StatusChip tone={participant.status === 'INTERVIEW_COMPLETED' ? 'good' : 'neutral'}>
                {participantStatusLabels[participant.status] ?? participant.status}
              </StatusChip>
            </li>
          ))}
        </ul>
      </section>

      {meeting.fixedSchedules.length > 0 && (
        <section>
          <SectionHeading title="이미 정해진 일정" description="AI가 바꾸지 않고 그대로 코스에 넣어요." />
          <ul className="card divide-y divide-ink-100">
            {meeting.fixedSchedules.map((schedule) => (
              <li key={schedule.id} className="px-4 py-3">
                <p className="text-sm font-semibold">{schedule.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">
                  {formatTime(schedule.startAt)}–{formatTime(schedule.endAt)} · {schedule.placeName}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {meeting.specialNotes && (
        <section>
          <SectionHeading title="미리 알려둔 점" />
          <p className="card p-4 text-sm leading-relaxed text-ink-700">{meeting.specialNotes}</p>
        </section>
      )}
    </div>
  );
}
