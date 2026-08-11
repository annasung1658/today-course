import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

/**
 * Prisma 클라이언트.
 *
 * 실제 인스턴스는 처음 접근할 때 만든다.
 * 빌드 단계에서 모듈만 불러오고 쿼리는 하지 않는 경로가 많아,
 * 최상위에서 곧바로 new PrismaClient()를 하면 불필요하게 커넥션을 잡는다.
 *
 * Accelerate로 감싸서 서버리스 인스턴스가 몇 개가 뜨든 실제 Postgres 커넥션은
 * Accelerate가 안전하게 관리하게 한다(Supabase 커넥션 풀 한도 초과 방지 + 캐싱).
 */
function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends(withAccelerate());
}

type ExtendedPrismaClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

function getClient(): ExtendedPrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

// Accelerate 확장 타입은 include/select 결과 추론을 깨뜨려서, 타입 표기는 원래
// PrismaClient로 되돌린다 — 확장된 클라이언트가 API 상위집합이라 런타임은 그대로 안전하다.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
