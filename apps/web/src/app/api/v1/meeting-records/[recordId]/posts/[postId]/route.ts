import { authedRoute, readJson } from '@/lib/api/handler';
import { recordPostSchema } from '@/server/schemas';
import { editPost, removePost } from '@/server/record-service';

export const PATCH = authedRoute<{ recordId: string; postId: string }, unknown>(
  async ({ params, request, session }) => {
    const input = recordPostSchema.pick({ content: true }).parse(await readJson(request));
    const post = await editPost(params.postId, session.userId, input.content);
    return { id: post.id, content: post.content };
  },
);

export const DELETE = authedRoute<{ recordId: string; postId: string }, unknown>(async ({ params, session }) =>
  removePost(params.postId, session.userId),
);
