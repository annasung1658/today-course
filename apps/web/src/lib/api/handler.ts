import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiError } from './errors';
import { fail, ok } from './response';
import { getSession, type SessionPayload } from '@/lib/auth/session';

export interface RouteContext<P = Record<string, string>> {
  request: Request;
  params: P;
  requestId: string;
}

export interface AuthedContext<P = Record<string, string>> extends RouteContext<P> {
  session: SessionPayload;
}

type Handler<P, R> = (ctx: RouteContext<P>) => Promise<R>;
type AuthedHandler<P, R> = (ctx: AuthedContext<P>) => Promise<R>;

const readRequestId = (request: Request) => request.headers.get('x-request-id') ?? randomUUID();

/** 인증이 필요 없는 라우트. */
export function route<P extends Record<string, string>, R>(handler: Handler<P, R>) {
  return async (request: Request, segment: { params: Promise<P> }): Promise<NextResponse> => {
    const requestId = readRequestId(request);
    try {
      const params = segment?.params ? await segment.params : ({} as P);
      const data = await handler({ request, params, requestId });
      return ok(data, requestId);
    } catch (error) {
      return fail(error, requestId);
    }
  };
}

/** 로그인한 사용자만 접근할 수 있는 라우트. */
export function authedRoute<P extends Record<string, string>, R>(handler: AuthedHandler<P, R>) {
  return async (request: Request, segment: { params: Promise<P> }): Promise<NextResponse> => {
    const requestId = readRequestId(request);
    try {
      const session = await getSession(request);
      if (!session) throw apiError('UNAUTHORIZED');
      const params = segment?.params ? await segment.params : ({} as P);
      const data = await handler({ request, params, requestId, session });
      return ok(data, requestId);
    } catch (error) {
      return fail(error, requestId);
    }
  };
}

/** 스케줄러(크론)만 호출할 수 있는 내부 라우트. */
export function internalRoute<P extends Record<string, string>, R>(handler: Handler<P, R>, cronSecret: string) {
  return async (request: Request, segment: { params: Promise<P> }): Promise<NextResponse> => {
    const requestId = readRequestId(request);
    try {
      const provided = request.headers.get('x-cron-secret') ?? '';
      if (provided !== cronSecret) throw apiError('FORBIDDEN');
      const params = segment?.params ? await segment.params : ({} as P);
      const data = await handler({ request, params, requestId });
      return ok(data, requestId);
    } catch (error) {
      return fail(error, requestId);
    }
  };
}

/** 본문을 안전하게 읽는다. 본문이 없으면 빈 객체. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    throw apiError('VALIDATION_ERROR', { body: 'JSON 형식이 아닙니다.' });
  }
}
