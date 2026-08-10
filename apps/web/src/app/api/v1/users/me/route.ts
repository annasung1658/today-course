import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute, readJson } from '@/lib/api/handler';
import { updateMeSchema } from '@/server/schemas';

export const GET = authedRoute(async ({ session }) => {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { notificationSetting: true },
  });
  if (!user) throw apiError('RESOURCE_NOT_FOUND');

  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
    authProvider: user.authProvider,
    createdAt: user.createdAt.toISOString(),
    notificationSettings: user.notificationSetting
      ? {
          invitationEnabled: user.notificationSetting.invitationEnabled,
          reminderEnabled: user.notificationSetting.reminderEnabled,
          votingEnabled: user.notificationSetting.votingEnabled,
          recordEnabled: user.notificationSetting.recordEnabled,
        }
      : null,
  };
});

export const PATCH = authedRoute(async ({ request, session }) => {
  const input = updateMeSchema.parse(await readJson(request));
  const user = await prisma.user.update({ where: { id: session.userId }, data: input });
  return { id: user.id, nickname: user.nickname, profileImageUrl: user.profileImageUrl };
});
