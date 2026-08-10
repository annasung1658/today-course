import { authedRoute } from '@/lib/api/handler';
import { declineInvitation } from '@/server/meeting-service';

export const POST = authedRoute<{ inviteCode: string }, unknown>(async ({ params, session }) =>
  declineInvitation(params.inviteCode, session.userId),
);
