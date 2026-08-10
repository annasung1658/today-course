import { authedRoute } from '@/lib/api/handler';
import { submitFeedback } from '@/server/feedback-service';

export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  submitFeedback(params.meetingId, session.userId),
);
