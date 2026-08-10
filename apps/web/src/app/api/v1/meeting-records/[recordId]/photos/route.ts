import { authedRoute, readJson } from '@/lib/api/handler';
import { recordPhotoSchema } from '@/server/schemas';
import { addPhoto } from '@/server/record-service';

export const POST = authedRoute<{ recordId: string }, unknown>(async ({ params, request, session }) => {
  const input = recordPhotoSchema.parse(await readJson(request));
  const photo = await addPhoto(params.recordId, session.userId, input);
  return { id: photo.id, fileUrl: photo.fileUrl, caption: photo.caption };
});
