import { authedRoute } from '@/lib/api/handler';
import { getOrCreateRecord, getRecordDetail } from '@/server/record-service';

export const GET = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) =>
  getRecordDetail(params.meetingId, session.userId),
);

export const POST = authedRoute<{ meetingId: string }, unknown>(async ({ params, session }) => {
  const record = await getOrCreateRecord(params.meetingId, session.userId);
  return { recordId: record.id, meetingId: params.meetingId };
});
