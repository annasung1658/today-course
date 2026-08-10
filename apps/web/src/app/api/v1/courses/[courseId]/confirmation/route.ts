import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute } from '@/lib/api/handler';
import type { PrismaRow } from '@/server/prisma-types';

export const GET = authedRoute<{ courseId: string }, unknown>(async ({ params }) => {
  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { items: { where: { status: { not: 'REPLACED' } }, orderBy: { sequence: 'asc' } } },
  });
  if (!course) throw apiError('RESOURCE_NOT_FOUND');

  return {
    courseId: course.id,
    meetingId: course.meetingId,
    status: course.status,
    confirmed: course.status === 'CONFIRMED',
    confirmedAt: course.confirmedAt?.toISOString() ?? null,
    votingEndsAt: course.votingEndsAt.toISOString(),
    serverTime: new Date().toISOString(),
    items: course.items.map((i: PrismaRow) => ({
      id: i.id,
      sequence: i.sequence,
      title: i.title,
      placeName: i.placeName,
      startAt: i.startAt.toISOString(),
      endAt: i.endAt.toISOString(),
      generationVersion: i.generationVersion,
    })),
  };
});
