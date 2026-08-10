import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/format';
import type { PrismaRow } from '@/server/prisma-types';

export const metadata: Metadata = { title: '알림' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const notifications = await prisma.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // 목록을 열면 읽음으로 표시한다.
  await prisma.notification.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });

  return (
      <div className="space-y-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">알림</h1>

        {notifications.length === 0 ? (
          <EmptyState title="알림이 없어요" description="약속에 초대되거나 코스가 나오면 여기에 표시돼요." />
        ) : (
          <ul className="space-y-2">
            {notifications.map((notification: PrismaRow) => {
              const body = (
                <div className="card p-4 transition-colors hover:border-ink-200 hover:bg-ink-50">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{notification.title}</p>
                    {!notification.readAt && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-600" aria-label="읽지 않음" />
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-700">{notification.body}</p>
                  <p className="mt-2 text-xs text-ink-300">{formatDateTime(notification.createdAt.toISOString())}</p>
                </div>
              );

              return (
                <li key={notification.id}>
                  {notification.linkUrl ? <Link href={notification.linkUrl}>{body}</Link> : body}
                </li>
              );
            })}
          </ul>
        )}
      </div>
  );
}
