import { authedRoute, readJson } from '@/lib/api/handler';
import { recordPhotoSchema } from '@/server/schemas';
import { addPhoto, reorderPhotos } from '@/server/record-service';

export const POST = authedRoute<{ recordId: string }, unknown>(async ({ params, request, session }) => {
  const input = recordPhotoSchema.parse(await readJson(request));
  const photo = await addPhoto(params.recordId, session.userId, input);
  return { id: photo.id, fileUrl: photo.fileUrl, caption: photo.caption };
});

export const PATCH = authedRoute<{ recordId: string }, unknown>(async ({ params, request, session }) => {
  const body = await readJson(request) as { photoIds?: unknown };
  if (!Array.isArray(body.photoIds) || body.photoIds.some((id) => typeof id !== 'string')) {
    throw new Error('사진 순서가 올바르지 않습니다.');
  }
  return reorderPhotos(params.recordId, session.userId, body.photoIds as string[]);
});
