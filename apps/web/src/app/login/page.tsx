import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isKakaoLoginEnabled } from '@/lib/env';
import { AuthForm } from '@/components/forms/auth-form';

export const metadata = { title: '로그인' };

export default async function LoginPage() {
  if (await getSession()) redirect('/');

  return (
    <main className="container-page flex min-h-screen max-w-md flex-col justify-center py-16">
      <Link href="/" className="mb-8 text-lg font-bold tracking-tight">
        오늘코스
      </Link>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">다시 만나서 반가워요</h1>
      <p className="mb-8 text-sm text-ink-500">로그인하면 참여 중인 약속을 이어서 볼 수 있어요.</p>
      <Suspense>
        <AuthForm mode="login" kakaoEnabled={isKakaoLoginEnabled()} />
      </Suspense>
    </main>
  );
}
