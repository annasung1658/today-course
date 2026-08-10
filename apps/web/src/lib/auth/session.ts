import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * 웹사이트이므로 Bearer 토큰이 아니라 httpOnly 쿠키 세션을 기본으로 쓴다.
 * API 명세의 Authorization 헤더도 함께 허용해 외부 클라이언트를 지원한다.
 */
const SESSION_COOKIE = 'oc_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14일

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export interface SessionPayload {
  userId: string;
  nickname: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== 'string' || typeof payload.nickname !== 'string') return null;
    return { userId: payload.userId, nickname: payload.nickname };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** 쿠키 또는 Authorization 헤더에서 현재 사용자를 읽는다. 없으면 null. */
export async function getSession(request?: Request): Promise<SessionPayload | null> {
  const bearer = request?.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    const fromHeader = await verifySession(bearer.slice(7));
    if (fromHeader) return fromHeader;
  }
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export { SESSION_COOKIE };
