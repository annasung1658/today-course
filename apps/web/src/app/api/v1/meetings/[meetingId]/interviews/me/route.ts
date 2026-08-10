import { authedRoute } from '@/lib/api/handler';
import { getMyInterview } from '@/server/interview-service';

export const GET = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  getMyInterview(params.meetingId, session.userId),
);
