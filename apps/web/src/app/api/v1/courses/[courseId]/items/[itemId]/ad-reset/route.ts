import { authedRoute } from '@/lib/api/handler';
import { resetRegenerationAfterAd } from '@/server/voting-service';

export const POST = authedRoute<{ courseId: string; itemId: string }, unknown>(
  async ({ params, session }) =>
    resetRegenerationAfterAd(params.courseId, params.itemId, session.userId),
);
