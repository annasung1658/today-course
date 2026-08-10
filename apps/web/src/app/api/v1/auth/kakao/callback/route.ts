import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { getKakaoAuthProvider } from '@/providers';
import { setSessionCookie } from '@/lib/auth/session';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return NextResponse.redirect(new URL('/login?error=kakao_failed', env.APP_URL));

  let returnTo = '/';
  try {
    if (state) returnTo = JSON.parse(Buffer.from(state, 'base64url').toString()).returnTo ?? '/';
  } catch {
    returnTo = '/';
  }

  try {
    const profile = await getKakaoAuthProvider().exchangeCode(
      code,
      `${env.APP_URL}/api/v1/auth/kakao/callback`,
    );

    const account = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: 'KAKAO', providerAccountId: profile.providerAccountId } },
      include: { user: true },
    });

    const user =
      account?.user ??
      (await prisma.user.upsert({
        where: { email: profile.email },
        create: {
          email: profile.email,
          nickname: profile.nickname,
          profileImageUrl: profile.profileImageUrl,
          authProvider: 'KAKAO',
          notificationSetting: { create: {} },
          accounts: { create: { provider: 'KAKAO', providerAccountId: profile.providerAccountId } },
        },
        update: {},
      }));

    await setSessionCookie({ userId: user.id, nickname: user.nickname });
    return NextResponse.redirect(new URL(returnTo, env.APP_URL));
  } catch {
    return NextResponse.redirect(new URL('/login?error=kakao_failed', env.APP_URL));
  }
}
