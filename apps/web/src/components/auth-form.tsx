'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

export function AuthForm({ mode, kakaoEnabled }: { mode: 'login' | 'signup'; kakaoEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/signup';
      const body = mode === 'login' ? { email, password } : { email, password, nickname };
      await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      router.push('/meetings');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
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
            placeholder="모임에서 보여질 이름"
            required
            maxLength={20}
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
          autoComplete="email"
          required
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
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'signup' ? 8 : 1}
        />
        {mode === 'signup' && <p className="mt-1.5 text-xs text-ink-500">8자 이상으로 정해주세요.</p>}
      </div>

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? '처리 중' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
      </button>

      {kakaoEnabled && (
        <a href="/api/v1/auth/kakao" className="btn-secondary w-full">
          카카오로 계속하기
        </a>
      )}

      <p className="text-center text-sm text-ink-500">
        {mode === 'login' ? (
          <>
            계정이 없나요?{' '}
            <Link href="/signup" className="font-semibold text-accent-600 hover:underline">
              가입하기
            </Link>
          </>
        ) : (
          <>
            이미 계정이 있나요?{' '}
            <Link href="/login" className="font-semibold text-accent-600 hover:underline">
              로그인
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
