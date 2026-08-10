import { prisma } from '@/lib/prisma';
import { authedRoute } from '@/lib/api/handler';

export const POST = authedRoute(async ({ session }) => {
  const result = await prisma.notification.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
});
