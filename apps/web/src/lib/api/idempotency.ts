import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { idempotencyPolicy, hours } from '@oneulcourse/core';
import { apiError } from './errors';

/**
 * 중복 실행을 막아야 하는 요청(약속 생성, 초대 수락, 인터뷰 제출, 투표 등)에 쓴다.
 * 같은 키로 같은 본문이 다시 오면 저장된 응답을 그대로 돌려주고,
 * 같은 키로 다른 본문이 오면 충돌로 막는다.
 */
export async function withIdempotency<T>(
  params: { request: Request; userId: string; endpoint: string; body: unknown },
  execute: () => Promise<T>,
): Promise<T> {
  const key = params.request.headers.get('idempotency-key');
  if (!key) return execute();

  const requestHash = createHash('sha256').update(JSON.stringify(params.body ?? {})).digest('hex');

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key_userId_endpoint: { key, userId: params.userId, endpoint: params.endpoint } },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw apiError('ALREADY_PROCESSED', { reason: '같은 키로 다른 요청이 이미 처리되었습니다.' });
    }
    return existing.responseBody as T;
  }

  const result = await execute();

  await prisma.idempotencyRecord.create({
    data: {
      key,
      userId: params.userId,
      endpoint: params.endpoint,
      requestHash,
      statusCode: 200,
      responseBody: result as never,
      expiresAt: new Date(Date.now() + hours(idempotencyPolicy.retentionHours)),
    },
  });

  return result;
}
