'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

/** 방장이 응답 마감을 기다리지 않고 바로 코스 생성을 트리거한다. */
export function CourseGenerationButton({
  meetingId,
  allResponded,
}: {
  meetingId: string;
  allResponded: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/meetings/${meetingId}/course-generation`, {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '코스 생성을 시작하지 못했어요.');
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <p className="font-semibold">코스를 만들 준비가 됐나요?</p>
      <p className="mt-1 text-sm text-ink-500">
        {allResponded
          ? '모두 취향을 알려줬어요. 지금 바로 코스를 만들 수 있어요.'
          : '아직 응답하지 않은 사람이 있어요. 마감을 기다리지 않고 지금 만들면, 응답 안 한 사람은 취향 없이 반영돼요.'}
      </p>
      {error && (
        <div className="mt-3">
          <ErrorNotice message={error} />
        </div>
      )}
      <button type="button" onClick={generate} className="btn-primary mt-3" disabled={loading}>
        {loading ? '시작하는 중' : '지금 코스 만들기'}
      </button>
    </div>
  );
}

/** GENERATING 상태인 동안 주기적으로 새로고침해서 완료되면 자동으로 다음 화면을 보여준다. */
export function GeneratingWatcher() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="card border-accent-100 bg-accent-50 p-5">
      <p className="font-semibold text-accent-700">AI가 코스를 만들고 있어요</p>
      <p className="mt-1 text-sm text-accent-700">보통 몇십 초 정도 걸려요. 이 화면은 자동으로 갱신돼요.</p>
    </div>
  );
}
