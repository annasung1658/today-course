import { authedRoute } from '@/lib/api/handler';
import { getResponseStatus } from '@/server/interview-service';

export const GET = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  getResponseStatus(params.meetingId, session.userId),
);
