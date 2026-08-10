import { prisma } from '@/lib/prisma';
import { authedRoute } from '@/lib/api/handler';
import { listMyMeetings } from '@/server/meeting-service';

/** 홈 요약. 지금 내가 해야 할 일을 먼저 보여준다. */
export const GET = authedRoute(async ({ session }) => {
  const meetings = await listMyMeetings(session.userId);
  const now = Date.now();

  const unreadCount = await prisma.notification.count({
    where: { userId: session.userId, readAt: null },
  });

  return {
    meetingsWaitingForMyResponse: meetings.filter(
      (m) =>
        ['INVITING', 'COLLECTING_RESPONSES'].includes(m.status) &&
        m.myStatus !== 'INTERVIEW_COMPLETED' &&
        new Date(m.responseDeadlineAt).getTime() > now,
    ),
    meetingsGenerating: meetings.filter((m) => m.status === 'GENERATING'),
    meetingsInVoting: meetings.filter((m) => m.status === 'VOTING'),
    upcomingMeetings: meetings.filter(
      (m) => m.status === 'CONFIRMED' && new Date(m.scheduledStartAt).getTime() > now,
    ),
    unreadNotificationCount: unreadCount,
    serverTime: new Date().toISOString(),
  };
});
