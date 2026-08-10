import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { readJson, route } from '@/lib/api/handler';
import { setSessionCookie } from '@/lib/auth/session';
import { loginSchema } from '@/server/schemas';

export const POST = route(async ({ request }) => {
  const input = loginSchema.parse(await readJson(request));

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // 계정 존재 여부를 노출하지 않도록 같은 오류로 응답한다.
  if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw apiError('UNAUTHORIZED', undefined, '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  await setSessionCookie({ userId: user.id, nickname: user.nickname });
  return { id: user.id, email: user.email, nickname: user.nickname };
});
