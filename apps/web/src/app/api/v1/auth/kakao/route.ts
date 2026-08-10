import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getKakaoAuthProvider } from '@/providers';

/** 카카오 설정이 없으면 로그인 화면으로 돌려보낸다. 앱이 깨지지 않게 한다. */
export async function GET(request: Request) {
  const provider = getKakaoAuthProvider();
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') ?? '/';

  if (!provider.enabled) {
    return NextResponse.redirect(new URL('/login?error=kakao_disabled', env.APP_URL));
  }

  const state = Buffer.from(JSON.stringify({ nonce: randomUUID(), returnTo })).toString('base64url');
  const redirectUri = `${env.APP_URL}/api/v1/auth/kakao/callback`;
  return NextResponse.redirect(provider.buildAuthorizeUrl(state, redirectUri));
}
