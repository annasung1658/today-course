import { authedRoute, readJson } from '@/lib/api/handler';
import { recordPostSchema } from '@/server/schemas';
import { addPost } from '@/server/record-service';

export const POST = authedRoute<{ recordId: string }, unknown>(async ({ params, request, session }) => {
  const input = recordPostSchema.parse(await readJson(request));
  const post = await addPost(params.recordId, session.userId, input);
  return { id: post.id, content: post.content, createdAt: post.createdAt.toISOString() };
});
