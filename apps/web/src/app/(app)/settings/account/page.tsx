import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { LogoutButton } from '@/components/logout-button';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: '계정' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  return (
      <div className="space-y-6">
        <div className="mx-auto max-w-md">
          <h1 className="mb-6 text-2xl font-bold tracking-tight">계정</h1>
          <dl className="card divide-y divide-ink-100 text-sm">
            <Row label="닉네임">{user.nickname}</Row>
            <Row label="이메일">{user.email}</Row>
            <Row label="로그인 방식">{user.authProvider === 'KAKAO' ? '카카오' : '이메일'}</Row>
            <Row label="가입일">{formatDate(user.createdAt.toISOString())}</Row>
          </dl>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </div>
      </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
