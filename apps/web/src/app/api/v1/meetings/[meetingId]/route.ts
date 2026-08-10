import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute, readJson } from '@/lib/api/handler';
import { updateMeetingSchema } from '@/server/schemas';
import { getMeetingDetail } from '@/server/meeting-service';

export const GET = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  getMeetingDetail(params.meetingId, session.userId),
);

export const PATCH = authedRoute<{ meetingId: string }, unknown>(async ({ request, params, session }) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: params.meetingId } });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.hostUserId !== session.userId) throw apiError('FORBIDDEN');
  // AI 생성이 시작된 뒤에는 날짜·시간·장소·픽스 일정을 바꿀 수 없다.
  if (['GENERATING', 'VOTING', 'CONFIRMED', 'COMPLETED'].includes(meeting.status)) {
    throw apiError('INVALID_MEETING_STATUS', { reason: '코스 생성이 시작되어 수정할 수 없습니다.' });
  }

  const input = updateMeetingSchema.parse(await readJson(request));
  const updated = await prisma.meeting.update({ where: { id: params.meetingId }, data: input });
  return { id: updated.id, title: updated.title, responseDeadlineAt: updated.responseDeadlineAt.toISOString() };
});
