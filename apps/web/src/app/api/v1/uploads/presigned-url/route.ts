import { authedRoute, readJson } from '@/lib/api/handler';
import { presignedUploadSchema } from '@/server/schemas';
import { getStorageProvider } from '@/providers';

/** 사진은 서버를 거치지 않고 Presigned URL로 직접 올린다. */
export const POST = authedRoute(async ({ request, session }) => {
  const input = presignedUploadSchema.parse(await readJson(request));
  const upload = await getStorageProvider().createPresignedUpload({
    userId: session.userId,
    contentType: input.contentType,
    extension: input.extension,
  });
  return { ...upload, expiresAt: upload.expiresAt.toISOString() };
});
