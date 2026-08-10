import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { authedRoute, readJson } from '@/lib/api/handler';
import { getMyInterview, updateExtractedPreference } from '@/server/interview-service';

export const GET = authedRoute<{ interviewId: string }, unknown>(async ({ params, session }) => {
  const interview = await prisma.aiInterview.findUnique({ where: { id: params.interviewId } });
  if (!interview) throw apiError('RESOURCE_NOT_FOUND');
  if (interview.userId !== session.userId) throw apiError('FORBIDDEN');
  const full = await getMyInterview(interview.meetingId, session.userId);
  return full.extracted;
});

export const PATCH = authedRoute<{ interviewId: string }, unknown>(async ({ params, request, session }) =>
  updateExtractedPreference(params.interviewId, session.userId, await readJson(request)),
);
