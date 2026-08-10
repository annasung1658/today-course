import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute } from '@/lib/api/handler';

/** 재생성 진행 상태 조회. 화면의 "재생성 중" 표시에 쓴다. */
export const GET = authedRoute<{ courseId: string; itemId: string }, unknown>(async ({ params }) => {
  const item = await prisma.courseItem.findUnique({ where: { id: params.itemId } });
  if (!item) throw apiError('RESOURCE_NOT_FOUND');

  const job = await prisma.aiJob.findFirst({
    where: { courseItemId: params.itemId, type: 'ITEM_REGENERATION' },
    orderBy: { scheduledAt: 'desc' },
  });

  return {
    courseItemId: item.id,
    itemStatus: item.status,
    generationVersion: item.generationVersion,
    regenerationCount: item.regenerationCount,
    maxRegenerationCount: item.maxRegenerationCount,
    revoteEndsAt: item.revoteEndsAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
    job: job
      ? { id: job.id, status: job.status, errorCode: job.errorCode, finishedAt: job.finishedAt?.toISOString() ?? null }
      : null,
  };
});
