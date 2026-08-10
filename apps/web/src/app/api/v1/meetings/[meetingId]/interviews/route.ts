import { authedRoute, readJson } from '@/lib/api/handler';
import { startInterviewSchema } from '@/server/schemas';
import { startInterview } from '@/server/interview-service';

export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, request, session }) => {
  const input = startInterviewSchema.parse(await readJson(request));
  return startInterview(params.meetingId, session.userId, input.loadDefaultPreferences);
});
