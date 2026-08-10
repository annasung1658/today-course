import { authedRoute } from '@/lib/api/handler';
import { remainingSecondsForCourse } from '@oneulcourse/core';
import { getCourse } from '@/server/course-service';
import type { PrismaRow } from '@/server/prisma-types';

export const GET = authedRoute<{ meetingId: string }, unknown>(async ({ params }) => {
  const course = await getCourse(params.meetingId);
  const now = new Date();

  return {
    id: course.id,
    meetingId: course.meetingId,
    status: course.status,
    title: course.title,
    summary: course.summary,
    estimatedBudgetPerPerson: course.estimatedBudgetPerPerson,
    votingStartedAt: course.votingStartedAt.toISOString(),
    votingEndsAt: course.votingEndsAt.toISOString(),
    serverTime: now.toISOString(),
    remainingSeconds: remainingSecondsForCourse(
      { votingStartedAt: course.votingStartedAt, votingEndsAt: course.votingEndsAt },
      now,
    ),
    confirmedAt: course.confirmedAt?.toISOString() ?? null,
    items: course.items.map((i: PrismaRow) => ({
      id: i.id,
      sequence: i.sequence,
      category: i.category,
      title: i.title,
      placeName: i.placeName,
      address: i.address,
      latitude: i.latitude,
      longitude: i.longitude,
      startAt: i.startAt.toISOString(),
      endAt: i.endAt.toISOString(),
      estimatedPricePerPerson: i.estimatedPricePerPerson,
      reason: i.reason,
      travelMinutesFromPrev: i.travelMinutesFromPrev,
      isFixedSchedule: i.fixedScheduleId !== null,
    })),
  };
});
