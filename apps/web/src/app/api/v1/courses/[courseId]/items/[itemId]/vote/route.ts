import { authedRoute, readJson } from '@/lib/api/handler';
import { withIdempotency } from '@/lib/api/idempotency';
import { castVoteSchema } from '@/server/schemas';
import { castVote, clearVote } from '@/server/voting-service';

export const PUT = authedRoute<{ courseId: string; itemId: string }, unknown>(
  async ({ params, request, session }) => {
    const body = await readJson(request);
    const input = castVoteSchema.parse(body);

    return withIdempotency(
      { request, userId: session.userId, endpoint: `PUT /courses/items/vote`, body },
      () =>
        castVote({
          courseId: params.courseId,
          itemId: params.itemId,
          userId: session.userId,
          vote: input.vote,
          itemGenerationVersion: input.itemGenerationVersion,
        }),
    );
  },
);

export const DELETE = authedRoute<{ courseId: string; itemId: string }, unknown>(
  async ({ params, session }) => clearVote(params.courseId, params.itemId, session.userId),
);
