import { authedRoute, readJson } from '@/lib/api/handler';
import { guestbookEntrySchema } from '@/server/schemas';
import { createGuestbookEntry, listGuestbookEntries } from '@/server/guestbook-service';

export const GET = authedRoute(async ({ request }) => {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50);
  return { entries: await listGuestbookEntries(Number.isFinite(limit) ? limit : 50) };
});

export const POST = authedRoute(async ({ request, session }) => {
  const input = guestbookEntrySchema.parse(await readJson(request));
  return { entry: await createGuestbookEntry(session.userId, input.content, input.anonymous) };
});
