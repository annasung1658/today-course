'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { formatClock, useServerCountdown } from '@/hooks/use-server-countdown';
import { categoryLabels, formatCurrency, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ErrorNotice, StatusChip } from '@/components/ui';
import { KakaoRouteMap } from '@/components/kakao-map';

interface VotingItem {
  courseItemId: string;
  sequence: number;
  category: string;
  title: string;
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  startAt: string;
  endAt: string;
  estimatedPricePerPerson: number;
  reason: string;
  travelMinutesFromPrev: number;
  generationVersion: number;
  likeCount: number;
  dislikeCount: number;
  myVote: 'LIKE' | 'DISLIKE' | null;
  status: string;
  phase: 'INITIAL' | 'REVOTE' | 'CLOSED';
  revoteEndsAt: string | null;
  remainingSeconds: number;
  regenerationCount: number;
  maxRegenerationCount: number;
  isFixedSchedule: boolean;
}

interface VotingState {
  courseId: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  summary: string;
  estimatedBudgetPerPerson: number;
  status: 'OPEN' | 'CLOSED';
  startedAt: string;
  endsAt: string;
  serverTime: string;
  remainingSeconds: number;
  eligibleParticipantCount: number;
  requiredDislikeCount: number;
  initialWindowMinutes: number;
  revoteWindowMinutes: number;
  items: VotingItem[];
}

const POLL_INTERVAL_MS = 4000;
const AD_VIEW_SECONDS = 15;
const AD_DESTINATION_URL = 'https://www.squidtrip.co.kr/';

export function VotingBoard({
  initialState,
  kakaoJsKey,
}: {
  initialState: VotingState;
  kakaoJsKey: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [adItem, setAdItem] = useState<VotingItem | null>(null);
  const [adSecondsRemaining, setAdSecondsRemaining] = useState(AD_VIEW_SECONDS);
  const [resetting, setResetting] = useState(false);

  const courseRemaining = useServerCountdown(state.endsAt, state.serverTime);

  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<VotingState>(`/courses/${initialState.courseId}/voting`);
      setState(next);
      if (next.status === 'CLOSED') router.refresh();
    } catch {
      // 폴링 실패는 조용히 넘긴다. 다음 주기에 다시 시도한다.
    }
  }, [initialState.courseId, router]);

  // 짧은 폴링으로 다른 사람의 투표와 재생성 상태를 반영한다.
  useEffect(() => {
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!adItem || adSecondsRemaining <= 0) return;
    const timer = window.setTimeout(() => {
      setAdSecondsRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [adItem, adSecondsRemaining]);

  const openAd = (item: VotingItem) => {
    setAdSecondsRemaining(AD_VIEW_SECONDS);
    setAdItem(item);
  };

  const vote = async (item: VotingItem, value: 'LIKE' | 'DISLIKE') => {
    setError(null);
    setPendingItemId(item.courseItemId);
    try {
      if (item.myVote === value) {
        await apiFetch(`/courses/${state.courseId}/items/${item.courseItemId}/vote`, { method: 'DELETE' });
      } else {
        await apiFetch(`/courses/${state.courseId}/items/${item.courseItemId}/vote`, {
          method: 'PUT',
          idempotencyKey: newIdempotencyKey(),
          body: JSON.stringify({ vote: value, itemGenerationVersion: item.generationVersion }),
        });
      }
      await refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.code === 'STALE_COURSE_ITEM') await refresh();
      } else {
        setError('투표를 저장하지 못했습니다.');
      }
    } finally {
      setPendingItemId(null);
    }
  };

  const resetAfterAd = async () => {
    if (!adItem) return;
    setResetting(true);
    setError(null);
    try {
      const reset = await apiFetch<{
        courseItemId: string;
        regenerationCount: number;
        maxRegenerationCount: number;
        generationVersion: number;
        status: string;
      }>(`/courses/${state.courseId}/items/${adItem.courseItemId}/ad-reset`, { method: 'POST' });

      // 재조회가 잠시 실패해도 광고 보상이 화면에 즉시 보이게 한다.
      setState((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.courseItemId === reset.courseItemId
            ? {
                ...item,
                regenerationCount: reset.regenerationCount,
                maxRegenerationCount: reset.maxRegenerationCount,
                generationVersion: reset.generationVersion,
                status: reset.status,
                myVote: null,
                likeCount: 0,
                dislikeCount: 0,
                phase: 'INITIAL',
                revoteEndsAt: null,
              }
            : item,
        ),
      }));
      setAdItem(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '재생성 횟수를 초기화하지 못했어요.');
    } finally {
      setResetting(false);
    }
  };

  const closed = state.status === 'CLOSED' || courseRemaining <= 0;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="order-2 space-y-3 lg:order-1">
        {error && <ErrorNotice message={error} />}

        <KakaoRouteMap
          apiKey={kakaoJsKey}
          points={state.items.map((item) => ({
            sequence: item.sequence,
            placeName: item.placeName,
            address: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            travelMinutesFromPrev: item.travelMinutesFromPrev,
          }))}
        />

        {state.items.map((item) => (
          <CourseItemCard
            key={item.courseItemId}
            item={item}
            serverTime={state.serverTime}
            requiredDislikeCount={state.requiredDislikeCount}
            eligibleParticipantCount={state.eligibleParticipantCount}
            revoteWindowMinutes={state.revoteWindowMinutes}
            disabled={closed || pendingItemId === item.courseItemId}
            onVote={vote}
            onWatchAd={openAd}
          />
        ))}
      </div>

      <aside className="order-1 lg:order-2 lg:sticky lg:top-20">
        <TimerPanel
          courseRemaining={courseRemaining}
          state={state}
          closed={closed}
        />
      </aside>
      </div>

      {adItem && (
        <div className="fixed inset-0 z-50 bg-white" role="dialog" aria-modal="true" aria-label="광고 둘러보기">
          <iframe
            src={AD_DESTINATION_URL}
            title="SquidTrip 광고"
            className="h-full w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
          />

          <div className="pointer-events-none absolute left-4 top-4 rounded-2xl bg-ink-900/85 px-4 py-3 text-white shadow-lift backdrop-blur-md sm:left-6 sm:top-6">
            <p className="text-[11px] font-semibold text-white/70">둘러보기 남은 시간</p>
            <p className="tnum mt-0.5 text-2xl font-black" aria-live="polite">
              00:{String(adSecondsRemaining).padStart(2, '0')}
            </p>
          </div>

          {adSecondsRemaining <= 0 && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center px-4 sm:bottom-8">
              <button
                type="button"
                className="btn-primary min-w-56 rounded-2xl px-8 py-4 text-base shadow-[0_16px_38px_rgba(30,105,185,.38)]"
                onClick={resetAfterAd}
                disabled={resetting}
              >
                {resetting ? '재생성 기회 여는 중' : '나가기 · 3회 다시 받기'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * 시그니처 요소: 두 개의 시계.
 * 바깥쪽 큰 숫자가 코스 확정까지 남은 60분 창이고,
 * 재생성된 항목에만 안쪽에 10분짜리 짧은 창이 따로 붙는다.
 */
function TimerPanel({
  courseRemaining,
  state,
  closed,
}: {
  courseRemaining: number;
  state: VotingState;
  closed: boolean;
}) {
  const totalSeconds = state.initialWindowMinutes * 60;
  const progress = Math.min(100, Math.max(0, ((totalSeconds - courseRemaining) / totalSeconds) * 100));
  const urgent = courseRemaining > 0 && courseRemaining <= 180;
  const revoting = state.items.filter((i) => i.phase === 'REVOTE').length;

  return (
    <div className="card overflow-hidden p-5 shadow-lift">
      <p className="text-sm font-medium text-ink-500">{state.meetingTitle}</p>
      <p className="mt-0.5 text-sm text-ink-500">참여 {state.eligibleParticipantCount}명</p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-300">확정까지</p>
      <p
        className={cn('tnum mt-1 text-5xl font-bold tracking-tight', urgent ? 'text-danger-600' : 'text-ink-900')}
        aria-live="off"
      >
        {closed ? '00:00' : formatClock(courseRemaining)}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn('h-full rounded-full transition-all', urgent ? 'bg-danger-600' : 'bg-accent-600')}
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        코스 생성 후 {state.initialWindowMinutes}분 동안 투표할 수 있어요. 싫어요가 과반수(
        {state.requiredDislikeCount}명)인 항목만 다시 골라요.
      </p>
      <p className="mt-2 rounded-xl bg-good-100 px-3 py-2 text-xs font-medium leading-relaxed text-good-600">
        모든 참여자가 모든 항목에 투표하면 남은 시간과 관계없이 코스가 바로 확정돼요.
      </p>

      {revoting > 0 && (
        <p className="mt-2 rounded-lg bg-accent-50 px-3 py-2 text-xs font-medium leading-relaxed text-accent-700">
          다시 고른 항목 {revoting}개는 {state.revoteWindowMinutes}분 안에 투표해 주세요. 코스 확정 시각은 그대로예요.
        </p>
      )}

      <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-500">1인 예상</dt>
          <dd className="font-semibold">{formatCurrency(state.estimatedBudgetPerPerson)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">코스</dt>
          <dd className="font-semibold">{state.items.length}곳</dd>
        </div>
      </dl>
    </div>
  );
}

function CourseItemCard({
  item,
  serverTime,
  requiredDislikeCount,
  eligibleParticipantCount,
  revoteWindowMinutes,
  disabled,
  onVote,
  onWatchAd,
}: {
  item: VotingItem;
  serverTime: string;
  requiredDislikeCount: number;
  eligibleParticipantCount: number;
  revoteWindowMinutes: number;
  disabled: boolean;
  onVote: (item: VotingItem, value: 'LIKE' | 'DISLIKE') => void;
  onWatchAd: (item: VotingItem) => void;
}) {
  const revoteRemaining = useServerCountdown(item.revoteEndsAt, serverTime);
  const regenerating = item.status === 'REGENERATION_QUEUED' || item.status === 'REGENERATING';
  const locked = item.status === 'LOCKED';
  const revoteClosed = item.phase === 'CLOSED' && item.revoteEndsAt !== null;
  const votable = !item.isFixedSchedule && !regenerating && !revoteClosed && !locked;

  return (
    <article
      className={cn(
        'card card-interactive p-4 sm:p-5',
        regenerating && 'border-accent-100 bg-accent-50/90',
        item.isFixedSchedule && 'border-ink-200 bg-ink-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-sm font-bold text-ink-300">{item.sequence}</span>
            <span className="text-sm font-medium text-ink-500">
              {categoryLabels[item.category as keyof typeof categoryLabels] ?? item.category}
            </span>
            {item.isFixedSchedule && <StatusChip>방장이 정한 일정</StatusChip>}
            {regenerating && <StatusChip tone="accent">다시 고르는 중</StatusChip>}
            {locked && <StatusChip>변경 횟수 소진</StatusChip>}
          </div>
          <h3 className="mt-1 truncate text-base font-bold tracking-tight">{item.placeName}</h3>
          <p className="mt-0.5 text-sm text-ink-500">
            {formatTime(item.startAt)} – {formatTime(item.endAt)}
            {item.travelMinutesFromPrev > 0 && ` · 이동 ${item.travelMinutesFromPrev}분`}
            {item.estimatedPricePerPerson > 0 && ` · ${formatCurrency(item.estimatedPricePerPerson)}`}
          </p>
        </div>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-ink-700">{item.reason}</p>

      {/* 재투표 중인 항목만 갖는 짧은 시계 */}
      {item.phase === 'REVOTE' && (
        <div className="mt-3 rounded-lg border border-accent-100 bg-accent-50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-accent-700">다시 고른 항목 · 재투표</span>
            <span className="tnum text-sm font-bold text-accent-700">{formatClock(revoteRemaining)}</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-accent-100">
            <div
              className="h-full rounded-full bg-accent-600 transition-all"
              style={{
                width: `${Math.min(100, Math.max(0, ((revoteWindowMinutes * 60 - revoteRemaining) / (revoteWindowMinutes * 60)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {revoteClosed && (
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs font-medium text-ink-500">
          이 항목의 재투표 시간이 끝났어요. 지금 장소로 확정돼요.
        </p>
      )}

      {!item.isFixedSchedule && (
        <div className="mt-4 flex items-center gap-2">
          <VoteButton
            active={item.myVote === 'LIKE'}
            disabled={disabled || !votable}
            tone="good"
            onClick={() => onVote(item, 'LIKE')}
            label={`좋아요 ${item.likeCount}`}
            aria-label={`${item.placeName} 좋아요, 현재 ${item.likeCount}명`}
          />
          <VoteButton
            active={item.myVote === 'DISLIKE'}
            disabled={disabled || !votable}
            tone="danger"
            onClick={() => onVote(item, 'DISLIKE')}
            label={`싫어요 ${item.dislikeCount}/${eligibleParticipantCount}`}
            aria-label={`${item.placeName} 싫어요, 현재 ${item.dislikeCount}명 중 ${requiredDislikeCount}명이면 다시 골라요`}
          />
          <span className="ml-auto text-xs text-ink-300">
            변경 {item.regenerationCount}/{item.maxRegenerationCount}
          </span>
        </div>
      )}

      {locked && (
        <div className="mt-4 rounded-2xl border border-accent-100 bg-accent-50 p-3.5">
          <p className="text-sm font-semibold text-accent-800">장소 변경 3회를 모두 사용했어요</p>
          <p className="mt-1 text-xs leading-relaxed text-accent-700">
            광고를 확인하면 이 항목의 변경 횟수를 초기화할 수 있어요.
          </p>
          <button
            type="button"
            className="btn-secondary mt-3 w-full bg-white"
            onClick={() => onWatchAd(item)}
            disabled={disabled}
          >
            광고 보고 초기화
          </button>
        </div>
      )}
    </article>
  );
}

function VoteButton({
  active,
  disabled,
  tone,
  onClick,
  label,
  ...rest
}: {
  active: boolean;
  disabled: boolean;
  tone: 'good' | 'danger';
  onClick: () => void;
  label: string;
} & React.AriaAttributes) {
  const tones = {
    good: active ? 'border-good-600 bg-good-100 text-good-600' : 'border-ink-200 text-ink-700 hover:bg-ink-50',
    danger: active ? 'border-danger-600 bg-danger-100 text-danger-600' : 'border-ink-200 text-ink-700 hover:bg-ink-50',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'tnum rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        tones[tone],
      )}
      {...rest}
    >
      {label}
    </button>
  );
}
