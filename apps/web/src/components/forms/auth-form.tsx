'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

/** 로그인·회원가입 공용 폼. 서버가 내려준 오류 메시지를 그대로 보여준다. */
export function AuthForm({ mode, kakaoEnabled }: { mode: 'login' | 'signup'; kakaoEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/';
  const kakaoError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = mode === 'signup' ? { email, password, nickname } : { email, password };
      await apiFetch(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {kakaoError === 'kakao_disabled' && (
        <ErrorNotice message="카카오 로그인이 아직 설정되지 않았어요. 이메일로 계속해 주세요." />
      )}
      {kakaoError === 'kakao_failed' && <ErrorNotice message="카카오 로그인에 실패했어요. 다시 시도해 주세요." />}
      {error && <ErrorNotice message={error} />}

      {mode === 'signup' && (
        <div>
          <label className="label" htmlFor="nickname">
            닉네임
          </label>
          <input
            id="nickname"
            className="field"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            maxLength={20}
            placeholder="함께 약속할 사람들에게 보여요"
          />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          이메일
        </label>
        <input
          id="email"
          type="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
        {mode === 'signup' && <p className="mt-1.5 text-xs text-ink-500">8자 이상 입력해 주세요.</p>}
      </div>

      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? '처리 중' : mode === 'signup' ? '가입하고 시작하기' : '로그인'}
      </button>

      {kakaoEnabled && (
        <a href={`/api/v1/auth/kakao?returnTo=${encodeURIComponent(returnTo)}`} className="btn-secondary w-full">
          카카오로 계속하기
        </a>
      )}

      <p className="text-center text-sm text-ink-500">
        {mode === 'signup' ? '이미 계정이 있나요? ' : '아직 계정이 없나요? '}
        <Link
          href={mode === 'signup' ? '/login' : '/signup'}
          className="font-semibold text-accent-600 hover:underline"
        >
          {mode === 'signup' ? '로그인' : '회원가입'}
        </Link>
      </p>
    </form>
  );
}
