import { authedRoute, readJson } from '@/lib/api/handler';
import { withIdempotency } from '@/lib/api/idempotency';
import { createMeetingSchema } from '@/server/schemas';
import { createMeeting, listMyMeetings } from '@/server/meeting-service';

export const GET = authedRoute(async ({ request, session }) => {
  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  return { meetings: await listMyMeetings(session.userId, status) };
});

export const POST = authedRoute(async ({ request, session }) => {
  const body = await readJson(request);
  const input = createMeetingSchema.parse(body);

  return withIdempotency({ request, userId: session.userId, endpoint: 'POST /meetings', body }, async () => {
    const meeting = await createMeeting(session.userId, input);
    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      responseDeadlineAt: meeting.responseDeadlineAt.toISOString(),
    };
  });
});
