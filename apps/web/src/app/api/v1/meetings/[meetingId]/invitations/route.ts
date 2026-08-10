import { env } from '@/lib/env';
import { authedRoute } from '@/lib/api/handler';
import { createInvitation } from '@/server/meeting-service';

export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  createInvitation(params.meetingId, session.userId, env.APP_URL),
);
