import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute } from '@/lib/api/handler';

export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: params.meetingId } });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.hostUserId !== session.userId) throw apiError('FORBIDDEN');

  await prisma.meeting.update({
    where: { id: params.meetingId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  return { id: params.meetingId, status: 'CANCELLED' };
});
