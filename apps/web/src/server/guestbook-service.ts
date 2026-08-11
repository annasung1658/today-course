import { prisma } from '@/lib/prisma';
import type { PrismaRow } from '@/server/prisma-types';

let schemaReady: Promise<void> | null = null;

/** 마이그레이션이 아직 적용되지 않은 dev DB에서도 최초 요청에 안전하게 테이블을 준비한다. */
async function ensureGuestbookSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "GuestbookEntry" (
          "id" TEXT NOT NULL,
          "authorId" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "GuestbookEntry_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "GuestbookEntry_authorId_fkey"
            FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "GuestbookEntry_createdAt_idx" ON "GuestbookEntry"("createdAt")',
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "GuestbookEntry_authorId_idx" ON "GuestbookEntry"("authorId")',
      );
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

const serialize = (entry: PrismaRow) => ({
  id: entry.id,
  content: entry.content,
  createdAt: entry.createdAt.toISOString(),
  author: {
    id: entry.author.id,
    nickname: entry.author.nickname,
    profileImageUrl: entry.author.profileImageUrl,
  },
});

export async function listGuestbookEntries(limit = 50) {
  await ensureGuestbookSchema();
  const entries = await prisma.guestbookEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    include: { author: { select: { id: true, nickname: true, profileImageUrl: true } } },
  });
  return entries.map(serialize);
}

export async function createGuestbookEntry(authorId: string, content: string) {
  await ensureGuestbookSchema();
  const entry = await prisma.guestbookEntry.create({
    data: { authorId, content },
    include: { author: { select: { id: true, nickname: true, profileImageUrl: true } } },
  });
  return serialize(entry);
}
