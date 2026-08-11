import { authedRoute } from '@/lib/api/handler';
import { createInvitation } from '@/server/meeting-service';

export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, request, session }) =>
  // main에서 만든 링크가 dev의 APP_URL을 따라가지 않도록 실제 요청의 origin을 사용한다.
  createInvitation(params.meetingId, session.userId, new URL(request.url).origin),
);
