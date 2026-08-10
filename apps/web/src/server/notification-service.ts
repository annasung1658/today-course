import { prisma } from '@/lib/prisma';
import { getNotificationProvider } from '@/providers';

/**
 * 알림은 항상 DB에 남기고, Provider로도 내보낸다.
 * 알림 설정을 끈 사용자에게는 보내지 않는다.
 */
async function create(params: {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  meetingId?: string;
  linkUrl?: string;
}) {
  if (params.userIds.length === 0) return;

  await prisma.notification.createMany({
    data: params.userIds.map((userId) => ({
      userId,
      type: params.type as never,
      title: params.title,
      body: params.body,
      meetingId: params.meetingId,
      linkUrl: params.linkUrl,
    })),
  });

  const provider = getNotificationProvider();
  await Promise.all(
    params.userIds.map((userId) =>
      provider.send({
        userId,
        type: params.type,
        title: params.title,
        body: params.body,
        meetingId: params.meetingId,
        linkUrl: params.linkUrl,
      }),
    ),
  );
}

async function participantUserIds(meetingId: string): Promise<string[]> {
  const participants = await prisma.participant.findMany({
    where: { meetingId, status: { not: 'DECLINED' } },
    select: { userId: true },
  });
  return participants.map((p: { userId: string }) => p.userId);
}

export const notify = {
  async invited(userId: string, meetingId: string, meetingTitle: string, hostNickname: string) {
    await create({
      userIds: [userId],
      type: 'MEETING_INVITED',
      title: '약속에 초대받았어요',
      body: `${hostNickname}님이 "${meetingTitle}"에 초대했어요.`,
      meetingId,
      linkUrl: `/meetings/${meetingId}`,
    });
  },

  async interviewReminder(meetingId: string, userIds: string[], minutesLeft: number) {
    await create({
      userIds,
      type: 'INTERVIEW_REMINDER',
      title: '취향 응답 마감이 다가와요',
      body: `${minutesLeft}분 뒤에 응답이 마감돼요. 아직 답변하지 않았다면 지금 알려주세요.`,
      meetingId,
      linkUrl: `/meetings/${meetingId}/interview`,
    });
  },

  async responsesClosed(meetingId: string) {
    await create({
      userIds: await participantUserIds(meetingId),
      type: 'RESPONSE_CLOSED',
      title: '응답이 마감됐어요',
      body: '모인 취향으로 코스를 만들고 있어요.',
      meetingId,
      linkUrl: `/meetings/${meetingId}`,
    });
  },

  async votingStarted(meetingId: string, courseId: string, windowMinutes: number) {
    await create({
      userIds: await participantUserIds(meetingId),
      type: 'VOTING_STARTED',
      title: '코스가 나왔어요',
      body: `지금부터 ${windowMinutes}분 동안 항목별로 투표할 수 있어요.`,
      meetingId,
      linkUrl: `/courses/${courseId}/voting`,
    });
  },

  async itemRegenerated(meetingId: string, sequence: number, placeName: string) {
    await create({
      userIds: await participantUserIds(meetingId),
      type: 'ITEM_REGENERATED',
      title: `${sequence}번 항목을 다시 골랐어요`,
      body: `${placeName}으로 바꿨어요. 10분 안에 다시 투표해 주세요.`,
      meetingId,
    });
  },

  async courseConfirmed(meetingId: string, courseTitle: string) {
    await create({
      userIds: await participantUserIds(meetingId),
      type: 'COURSE_CONFIRMED',
      title: '코스가 확정됐어요',
      body: `"${courseTitle}"으로 정해졌어요.`,
      meetingId,
      linkUrl: `/meetings/${meetingId}`,
    });
  },

  async commentAdded(meetingId: string, authorNickname: string) {
    await create({
      userIds: await participantUserIds(meetingId),
      type: 'COMMENT_ADDED',
      title: '새 댓글이 달렸어요',
      body: `${authorNickname}님이 기록에 댓글을 남겼어요.`,
      meetingId,
      linkUrl: `/meetings/${meetingId}/record`,
    });
  },
};
