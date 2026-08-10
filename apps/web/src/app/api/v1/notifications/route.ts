import { prisma } from '@/lib/prisma';
import { authedRoute } from '@/lib/api/handler';
import type { PrismaRow } from '@/server/prisma-types';

export const GET = authedRoute(async ({ request, session }) => {
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') ?? 20), 50);
  const notifications = await prisma.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return {
    notifications: notifications.map((n: PrismaRow) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      meetingId: n.meetingId,
      linkUrl: n.linkUrl,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount: await prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
  };
});
