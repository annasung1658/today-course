import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { readJson, route } from '@/lib/api/handler';
import { setSessionCookie } from '@/lib/auth/session';
import { signupSchema } from '@/server/schemas';

export const POST = route(async ({ request }) => {
  const input = signupSchema.parse(await readJson(request));

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw apiError('VALIDATION_ERROR', { email: '이미 가입된 이메일입니다.' });

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      nickname: input.nickname,
      authProvider: 'EMAIL',
      notificationSetting: { create: {} },
    },
  });

  await setSessionCookie({ userId: user.id, nickname: user.nickname });
  return { id: user.id, email: user.email, nickname: user.nickname };
});
