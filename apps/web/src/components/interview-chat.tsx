'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { ErrorNotice, StatusChip } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

interface Extracted {
  preferredFoods: string[];
  dislikedFoods: string[];
  allergies: string[];
  preferredActivities: string[];
  preferredAtmospheres: string[];
  budget: { min: number; max: number; currency: string } | null;
  mustHave: string[];
  mustAvoid: string[];
  editedByUser: boolean;
}

interface Interview {
  interviewId: string;
  meetingId: string;
  status: 'IN_PROGRESS' | 'READY_TO_SUBMIT' | 'SUBMITTED';
  currentQuestion: number;
  targetQuestionCount: number;
  messages: Array<{ id: string; role: 'USER' | 'ASSISTANT'; content: string; turn: number }>;
  extracted: Extracted | null;
}

const LABELS: Record<string, string> = {
  KOREAN: '한식', JAPANESE: '일식', CHINESE: '중식', WESTERN: '양식', ASIAN: '아시안', SNACK: '분식',
  WALK: '산책', EXHIBITION: '전시', SHOPPING: '쇼핑', ACTIVITY: '체험', CAFE: '카페', BAR: '술집',
  QUIET: '조용한', CASUAL: '편안한', TRENDY: '트렌디한', SPECIAL: '특별한',
  PEANUT: '땅콩', TREE_NUT: '견과류', SHELLFISH: '갑각류', DAIRY: '유제품', EGG: '계란', GLUTEN: '밀·글루텐',
  PET_FRIENDLY: '반려견 동반', STEP_FREE: '계단 없는 입구', PARKING: '주차', PRIVATE_ROOM: '룸',
  LONG_WAIT: '긴 웨이팅', CROWDED: '붐비는 곳', SPICY: '매운 음식', SMOKING: '흡연 공간', SEAFOOD: '해산물',
};

const label = (value: string) => LABELS[value] ?? value;

export function InterviewChat({ meetingId, initial }: { meetingId: string; initial: Interview | null }) {
  const router = useRouter();
  const [interview, setInterview] = useState<Interview | null>(initial);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [interview?.messages.length]);

  const start = async (loadDefaults: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setInterview(
        await apiFetch<Interview>(`/meetings/${meetingId}/interviews`, {
          method: 'POST',
          body: JSON.stringify({ loadDefaultPreferences: loadDefaults }),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '인터뷰를 시작하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!interview || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setInterview(
        await apiFetch<Interview>(`/interviews/${interview.interviewId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: draft.trim() }),
        }),
      );
      setDraft('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '메시지를 보내지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!interview) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/interviews/${interview.interviewId}/submit`, {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
      });
      router.push(`/meetings/${meetingId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '제출하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  if (!interview) {
    return (
      <div className="card p-6">
        {error && <ErrorNotice message={error} />}
        <p className="font-semibold">취향을 알려주세요</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-500">
          네 가지만 물어볼게요. 답변 내용은 다른 참여자에게 보이지 않고, 코스를 만들 때만 쓰여요.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => start(false)} disabled={busy}>
            처음부터 답하기
          </button>
          <button type="button" className="btn-secondary" onClick={() => start(true)} disabled={busy}>
            내 기본 설정 불러오기
          </button>
        </div>
      </div>
    );
  }

  const submitted = interview.status === 'SUBMITTED';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-4">
        {error && <ErrorNotice message={error} />}

        <div className="card space-y-3 p-5 sm:p-6">
          {interview.messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'ASSISTANT'
                  ? 'max-w-[85%] animate-fade-up rounded-[1.25rem] rounded-tl-md bg-accent-50 px-4 py-3 text-sm leading-relaxed text-ink-700'
                  : 'ml-auto max-w-[85%] animate-fade-up rounded-[1.25rem] rounded-tr-md bg-accent-600 px-4 py-3 text-sm leading-relaxed text-white shadow-[0_6px_18px_rgba(47,146,229,.2)]'
              }
            >
              {message.content}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {!submitted && (
          <form onSubmit={send} className="flex gap-2">
            <input
              className="field flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="편하게 답해주세요"
              maxLength={1000}
              disabled={busy}
              aria-label="답변"
            />
            <button type="submit" className="btn-primary shrink-0" disabled={busy || !draft.trim()}>
              보내기
            </button>
          </form>
        )}
      </div>

      <aside className="card p-5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">이렇게 이해했어요</h2>
          {submitted && <StatusChip tone="good">제출 완료</StatusChip>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          틀린 내용이 있으면 다시 이야기해 주세요. 제출 전까지 바뀔 수 있어요.
        </p>

        {interview.extracted ? (
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="좋아하는 음식" values={interview.extracted.preferredFoods} />
            <Row label="피하고 싶은 음식" values={interview.extracted.dislikedFoods} />
            <Row label="알레르기" values={interview.extracted.allergies} tone="danger" />
            <Row label="하고 싶은 활동" values={interview.extracted.preferredActivities} />
            <Row label="원하는 분위기" values={interview.extracted.preferredAtmospheres} />
            <Row label="꼭 필요한 조건" values={interview.extracted.mustHave} />
            <Row label="피하고 싶은 것" values={interview.extracted.mustAvoid} />
            {interview.extracted.budget && (
              <div>
                <dt className="text-xs font-medium text-ink-500">1인 예산</dt>
                <dd className="mt-1 font-semibold">
                  {formatCurrency(interview.extracted.budget.min)} – {formatCurrency(interview.extracted.budget.max)}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-ink-300">아직 정리된 내용이 없어요.</p>
        )}

        {!submitted && (
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            onClick={submit}
            disabled={busy || !interview.extracted}
          >
            이대로 제출하기
          </button>
        )}
      </aside>
    </div>
  );
}

function Row({ label: title, values, tone }: { label: string; values: string[]; tone?: 'danger' }) {
  if (values.length === 0) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-ink-500">{title}</dt>
      <dd className="mt-1 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className={`chip ${tone === 'danger' ? 'border-danger-100 bg-danger-100 text-danger-600' : 'border-ink-200 text-ink-700'}`}
          >
            {label(value)}
          </span>
        ))}
      </dd>
    </div>
  );
}
