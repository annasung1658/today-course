import { authedRoute, readJson } from '@/lib/api/handler';
import { interviewMessageSchema } from '@/server/schemas';
import { sendInterviewMessage } from '@/server/interview-service';

export const POST = authedRoute<{ interviewId: string }, unknown>(async ({ params, request, session }) => {
  const input = interviewMessageSchema.parse(await readJson(request));
  return sendInterviewMessage(params.interviewId, session.userId, input.content);
});
