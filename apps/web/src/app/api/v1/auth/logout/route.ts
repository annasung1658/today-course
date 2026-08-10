import { route } from '@/lib/api/handler';
import { clearSessionCookie } from '@/lib/auth/session';

export const POST = route(async () => {
  await clearSessionCookie();
  return { loggedOut: true };
});
