import { authedRoute, readJson } from '@/lib/api/handler';
import { withIdempotency } from '@/lib/api/idempotency';
import { acceptInvitation } from '@/server/meeting-service';

export const POST = authedRoute<{ inviteCode: string }, unknown>(async ({ params, request, session }) => {
  const body = await readJson(request);
  return withIdempotency(
    { request, userId: session.userId, endpoint: 'POST /invitations/accept', body },
    () => acceptInvitation(params.inviteCode, session.userId),
  );
});
