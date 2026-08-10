import { authedRoute, readJson } from '@/lib/api/handler';
import { withIdempotency } from '@/lib/api/idempotency';
import { submitInterview } from '@/server/interview-service';

export const POST = authedRoute<{ interviewId: string }, unknown>(async ({ params, request, session }) => {
  const body = await readJson(request);
  return withIdempotency(
    { request, userId: session.userId, endpoint: 'POST /interviews/submit', body },
    () => submitInterview(params.interviewId, session.userId),
  );
});
