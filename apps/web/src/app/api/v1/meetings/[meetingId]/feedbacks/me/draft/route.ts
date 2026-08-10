import { authedRoute, readJson } from '@/lib/api/handler';
import { feedbackDraftSchema } from '@/server/schemas';
import { getDraft, saveDraft } from '@/server/feedback-service';

export const GET = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  getDraft(params.meetingId, session.userId),
);

export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, request, session }) => {
  const input = feedbackDraftSchema.parse(await readJson(request));
  const saved = await saveDraft(params.meetingId, session.userId, input);
  return { feedbackId: saved.id, status: saved.status };
});

export const PATCH = authedRoute<{ meetingId: string }, unknown>(async ({ params, request, session }) => {
  const input = feedbackDraftSchema.parse(await readJson(request));
  const saved = await saveDraft(params.meetingId, session.userId, input);
  return { feedbackId: saved.id, status: saved.status };
});
