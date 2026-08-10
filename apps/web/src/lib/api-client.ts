'use client';

/** 브라우저에서 공통 응답 봉투를 벗겨내는 얇은 클라이언트. */
export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit & { idempotencyKey?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (init?.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);

  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    const error = payload?.error;
    throw new ApiClientError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? '요청을 처리하지 못했습니다.',
      error?.details,
    );
  }
  return payload.data as T;
}

export const newIdempotencyKey = () => crypto.randomUUID();
