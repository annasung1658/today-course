import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute } from '@/lib/api/handler';

export const GET = authedRoute<{ jobId: string }, unknown>(async ({ params }) => {
  const job = await prisma.aiJob.findUnique({ where: { id: params.jobId } });
  if (!job) throw apiError('RESOURCE_NOT_FOUND');
  return {
    jobId: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    errorCode: job.errorCode,
    result: job.result,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
});
