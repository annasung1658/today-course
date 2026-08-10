import type { AuthProviderAdapter, OAuthProfile } from '@/providers/types';

/** 카카오 OAuth 실제 연동. 키가 있을 때만 레지스트리가 이 구현을 선택한다. */
export class KakaoAuthProvider implements AuthProviderAdapter {
  readonly name = 'kakao';
  readonly enabled = true;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'profile_nickname profile_image account_email',
    });
    return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthProfile> {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!tokenRes.ok) throw new Error('카카오 토큰 교환에 실패했습니다.');
    const token = (await tokenRes.json()) as { access_token: string };

    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) throw new Error('카카오 사용자 정보를 가져오지 못했습니다.');
    const me = (await meRes.json()) as {
      id: number;
      kakao_account?: {
        email?: string;
        profile?: { nickname?: string; profile_image_url?: string };
      };
    };

    const account = me.kakao_account;
    return {
      providerAccountId: String(me.id),
      email: account?.email ?? `kakao_${me.id}@oneulcourse.local`,
      nickname: account?.profile?.nickname ?? '카카오 사용자',
      profileImageUrl: account?.profile?.profile_image_url ?? null,
    };
  }
}
