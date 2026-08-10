import { z } from 'zod';
import { authedRoute, readJson } from '@/lib/api/handler';
import { applyPreferenceUpdates } from '@/server/feedback-service';

const schema = z.object({
  approved: z.array(z.object({ field: z.enum(['mustHave', 'mustAvoid']), value: z.string().max(40) })).max(10),
});

/** 사용자가 승인한 항목만 기본 설정에 반영한다. */
export const POST = authedRoute<{ feedbackId: string }, unknown>(async ({ params, request, session }) => {
  const input = schema.parse(await readJson(request));
  return applyPreferenceUpdates(params.feedbackId, session.userId, input.approved);
});
