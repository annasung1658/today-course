import { authedRoute } from '@/lib/api/handler';
import { getCalendar } from '@/server/record-service';

export const GET = authedRoute(async ({ request, session }) => {
  const url = new URL(request.url);
  const now = new Date();
  const year = Number(url.searchParams.get('year') ?? now.getUTCFullYear());
  const month = Number(url.searchParams.get('month') ?? now.getUTCMonth() + 1);
  return getCalendar(session.userId, year, month);
});
