import { prisma } from '@/lib/prisma';
import { authedRoute } from '@/lib/api/handler';

export const PATCH = authedRoute<{ notificationId: string }, unknown>(async ({ params, session }) => {
  await prisma.notification.updateMany({
    where: { id: params.notificationId, userId: session.userId },
    data: { readAt: new Date() },
  });
  return { id: params.notificationId, read: true };
});
