import { PrismaClient } from '@prisma/client';

/**
 * Prisma 클라이언트.
 *
 * 실제 인스턴스는 처음 접근할 때 만든다.
 * 빌드 단계에서 모듈만 불러오고 쿼리는 하지 않는 경로가 많아,
 * 최상위에서 곧바로 new PrismaClient()를 하면 불필요하게 커넥션을 잡는다.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
