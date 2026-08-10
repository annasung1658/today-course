import { route } from '@/lib/api/handler';
import { getSession } from '@/lib/auth/session';
import { previewInvitation } from '@/server/meeting-service';

/** 비로그인 사용자도 초대장을 먼저 볼 수 있다. */
export const GET = route<{ inviteCode: string }, unknown>(async ({ params, request }) => {
  const session = await getSession(request);
  return previewInvitation(params.inviteCode, session?.userId ?? null);
});
