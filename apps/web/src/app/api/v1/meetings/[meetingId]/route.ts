import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute, readJson } from '@/lib/api/handler';
import { updateMeetingSchema } from '@/server/schemas';
import { getMeetingDetail } from '@/server/meeting-service';
import { getStorageProvider } from '@/providers';
import { meetingRemovalScope } from '@/lib/meeting-lifecycle';

export const GET = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  getMeetingDetail(params.meetingId, session.userId),
);

export const PATCH = authedRoute<{ meetingId: string }, unknown>(async ({ request, params, session }) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: params.meetingId } });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.hostUserId !== session.userId) throw apiError('FORBIDDEN');
  if (meeting.status === 'CANCELLED') throw apiError('INVALID_MEETING_STATUS', { reason: '취소된 약속은 수정할 수 없습니다.' });

  const input = updateMeetingSchema.parse(await readJson(request));
  if (input.capacity) {
    const participantCount = await prisma.participant.count({ where: { meetingId: params.meetingId, status: { not: 'DECLINED' } } });
    if (input.capacity < participantCount) {
      throw apiError('VALIDATION_ERROR', { reason: '현재 참여 인원보다 적게 설정할 수 없습니다.' });
    }
  }
  const updated = await prisma.meeting.update({ where: { id: params.meetingId }, data: input });
  return { id: updated.id, title: updated.title, responseDeadlineAt: updated.responseDeadlineAt.toISOString() };
});

export const DELETE = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.meetingId },
    select: { hostUserId: true, record: { select: { photos: { select: { storageKey: true } } } } },
  });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.hostUserId !== session.userId) {
    const participant = await prisma.participant.findUnique({
      where: { meetingId_userId: { meetingId: params.meetingId, userId: session.userId } },
    });
    if (!participant || meetingRemovalScope(false, participant.status) === 'FORBIDDEN') throw apiError('FORBIDDEN');
    await prisma.participant.update({ where: { id: participant.id }, data: { status: 'DECLINED' } });
    return { id: params.meetingId, deleted: true, scope: 'MEMBER_ONLY' };
  }
  await prisma.meeting.delete({ where: { id: params.meetingId } });
  const storage = getStorageProvider();
  await Promise.allSettled((meeting.record?.photos ?? []).flatMap((photo) => photo.storageKey ? [storage.remove(photo.storageKey)] : []));
  return { id: params.meetingId, deleted: true, scope: 'EVERYONE' };
});
