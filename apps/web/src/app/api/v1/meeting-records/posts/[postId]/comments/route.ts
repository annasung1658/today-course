import { authedRoute, readJson } from '@/lib/api/handler';
import { recordCommentSchema } from '@/server/schemas';
import { addComment } from '@/server/record-service';

export const POST = authedRoute<{ postId: string }, unknown>(async ({ params, request, session }) => {
  const input = recordCommentSchema.parse(await readJson(request));
  const comment = await addComment(params.postId, session.userId, input.content, session.nickname);
  return { id: comment.id, content: comment.content, createdAt: comment.createdAt.toISOString() };
});
