import { authedRoute } from '@/lib/api/handler';
import { removePhoto } from '@/server/record-service';

export const DELETE = authedRoute<{ photoId: string }, unknown>(async ({ params, session }) => {
  return removePhoto(params.photoId, session.userId);
});
