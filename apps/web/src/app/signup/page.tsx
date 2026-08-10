import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isKakaoLoginEnabled } from '@/lib/env';
import { AuthForm } from '@/components/forms/auth-form';

export const metadata = { title: '회원가입' };

export default async function SignupPage() {
  if (await getSession()) redirect('/');

  return (
    <main className="container-page flex min-h-screen max-w-md flex-col justify-center py-16">
      <Link href="/" className="mb-8 text-lg font-bold tracking-tight">
        오늘코스
      </Link>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">모두의 취향으로 코스를 만들어요</h1>
      <p className="mb-8 text-sm text-ink-500">
        참여자마다 따로 인터뷰하고, 모인 취향으로 하나의 코스를 추천해요.
      </p>
      <Suspense>
        <AuthForm mode="signup" kakaoEnabled={isKakaoLoginEnabled()} />
      </Suspense>
    </main>
  );
}
