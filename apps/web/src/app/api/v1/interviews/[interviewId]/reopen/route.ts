import { authedRoute } from '@/lib/api/handler';
import { reopenInterview } from '@/server/interview-service';

export const POST = authedRoute<{ interviewId: string }, unknown>(async ({ params, session }) =>
  reopenInterview(params.interviewId, session.userId),
);
