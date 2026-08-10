import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute, readJson } from '@/lib/api/handler';
import { withIdempotency } from '@/lib/api/idempotency';
import { closeResponsesAndQueueGeneration, queueCourseGeneration } from '@/server/course-service';

/**
 * 응답 마감 후 서버가 자동 호출한다.
 * 실패했을 때 방장이 직접 재시도할 수도 있다.
 */
export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, request, session }) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: params.meetingId } });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.hostUserId !== session.userId) throw apiError('FORBIDDEN');

  const body = await readJson(request);
  return withIdempotency(
    { request, userId: session.userId, endpoint: 'POST /course-generation', body },
    async () => {
      if (meeting.responsesClosedAt) {
        const job = await queueCourseGeneration(params.meetingId);
        return { jobId: job.id, status: job.status };
      }
      return closeResponsesAndQueueGeneration(params.meetingId);
    },
  );
});
