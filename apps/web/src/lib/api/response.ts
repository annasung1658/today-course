import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, errorCatalog, type ErrorCode } from './errors';

/** API 명세 §4.4 / §4.5의 공통 응답 봉투. */
export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
  meta: ApiMeta;
}

const meta = (requestId: string): ApiMeta => ({ requestId, timestamp: new Date().toISOString() });

export function ok<T>(data: T, requestId: string, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true as const, data, meta: meta(requestId) }, { status });
}

export function fail(error: unknown, requestId: string): NextResponse<ApiFailure> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false as const,
        error: { code: error.code, message: error.message, details: error.details },
        meta: meta(requestId),
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const details = Object.fromEntries(
      error.issues.map((i) => [i.path.join('.') || '_', i.message]),
    );
    return NextResponse.json(
      {
        success: false as const,
        error: { code: 'VALIDATION_ERROR' as const, message: errorCatalog.VALIDATION_ERROR.message, details },
        meta: meta(requestId),
      },
      { status: 400 },
    );
  }

  console.error('[api] unhandled error', error);
  return NextResponse.json(
    {
      success: false as const,
      error: { code: 'INTERNAL_ERROR' as const, message: errorCatalog.INTERNAL_ERROR.message },
      meta: meta(requestId),
    },
    { status: 500 },
  );
}
