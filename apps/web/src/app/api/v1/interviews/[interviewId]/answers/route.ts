import { authedRoute, readJson } from '@/lib/api/handler';
import { surveyAnswersSchema } from '@/server/schemas';
import { submitSurveyAnswers } from '@/server/interview-service';

export const POST = authedRoute<{ interviewId: string }, unknown>(async ({ params, request, session }) => {
  const input = surveyAnswersSchema.parse(await readJson(request));
  return submitSurveyAnswers(params.interviewId, session.userId, input);
});
