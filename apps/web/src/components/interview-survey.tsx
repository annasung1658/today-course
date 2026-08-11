'use client';

import { useState } from 'react';
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
  extracted: Extracted | null;
}

const LABELS: Record<string, string> = {
  WALK: '산책', EXHIBITION: '전시', SHOPPING: '쇼핑', ACTIVITY: '체험', CAFE: '카페', BAR: '술집',
  QUIET: '조용한', CASUAL: '편안한', TRENDY: '트렌디한', SPECIAL: '특별한',
  PEANUT: '땅콩', TREE_NUT: '견과류', SHELLFISH: '갑각류', DAIRY: '유제품', EGG: '계란', GLUTEN: '밀·글루텐',
  PET_FRIENDLY: '반려견 동반', STEP_FREE: '계단 없는 입구', PARKING: '주차', PRIVATE_ROOM: '룸',
  LONG_WAIT: '긴 웨이팅', CROWDED: '붐비는 곳', SPICY: '매운 음식', SMOKING: '흡연 공간', SEAFOOD: '해산물',
};

const label = (value: string) => LABELS[value] ?? value;

interface Answers {
  foodWant: string;
  foodAvoid: string;
  activityWant: string;
  activityAvoid: string;
  budget: string;
  notes: string;
}

const EMPTY_ANSWERS: Answers = { foodWant: '', foodAvoid: '', activityWant: '', activityAvoid: '', budget: '', notes: '' };

const FIELDS: Array<{ key: keyof Answers; label: string; placeholder: string }> = [
  { key: 'foodWant', label: '먹고 싶은 음식', placeholder: '예: 파스타, 초밥' },
  { key: 'foodAvoid', label: '못 먹는 음식', placeholder: '예: 곱창, 회' },
  { key: 'activityWant', label: '하고 싶은 활동', placeholder: '예: 산책, 전시 보기' },
  { key: 'activityAvoid', label: '하기 싫은 활동', placeholder: '예: 오래 걷기' },
  { key: 'budget', label: '1인 기준 예산', placeholder: '예: 3만원' },
  { key: 'notes', label: '특별히 고려했으면 좋을 사항', placeholder: '알레르기, 반려견 동반, 이동 제약 등' },
];

export function InterviewSurvey({ meetingId, initial }: { meetingId: string; initial: Interview | null }) {
  const router = useRouter();
  const [interview, setInterview] = useState<Interview | null>(initial);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const saveAnswers = async () => {
    if (!interview) return;
    setBusy(true);
    setError(null);
    try {
      setInterview(
        await apiFetch<Interview>(`/interviews/${interview.interviewId}/answers`, {
          method: 'POST',
          body: JSON.stringify(answers),
        }),
      );
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '답변을 저장하지 못했어요.');
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
          아래 항목에 답해주세요. 전부 비워두고 제출해도 괜찮아요. 답변은 다른 참여자에게 보이지 않고, 코스를 만들 때만 쓰여요.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => start(false)} disabled={busy}>
            답변하기
          </button>
          <button type="button" className="btn-secondary" onClick={() => start(true)} disabled={busy}>
            내 기본 설정 불러오기
          </button>
        </div>
      </div>
    );
  }

  const submitted = interview.status === 'SUBMITTED';
  const showForm = !submitted && (editing || !interview.extracted);

  return (
    <div className="space-y-4">
      {error && <ErrorNotice message={error} />}

      {showForm && (
        <div className="card space-y-4 p-5">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={field.key} className="text-sm font-medium text-ink-700">
                {field.label}
              </label>
              <input
                id={field.key}
                className="field mt-1.5"
                value={answers[field.key]}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                maxLength={500}
                disabled={busy}
              />
            </div>
          ))}
          <button type="button" className="btn-primary w-full" onClick={saveAnswers} disabled={busy}>
            {busy ? '정리하는 중' : '다음'}
          </button>
        </div>
      )}

      {!showForm && (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">이렇게 이해했어요</h2>
            {submitted && <StatusChip tone="good">제출 완료</StatusChip>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            틀린 내용이 있으면 다시 작성해 주세요. 제출 전까지 바뀔 수 있어요.
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
              {interview.extracted.preferredFoods.length === 0 &&
                interview.extracted.dislikedFoods.length === 0 &&
                interview.extracted.allergies.length === 0 &&
                interview.extracted.preferredActivities.length === 0 &&
                interview.extracted.preferredAtmospheres.length === 0 &&
                interview.extracted.mustHave.length === 0 &&
                interview.extracted.mustAvoid.length === 0 &&
                !interview.extracted.budget && (
                  <p className="text-ink-300">특별히 밝힌 취향이 없어요. 코스 생성 시 중립으로 반영돼요.</p>
                )}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-ink-300">아직 정리된 내용이 없어요.</p>
          )}

          {!submitted && (
            <div className="mt-5 flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setEditing(true)} disabled={busy}>
                다시 작성하기
              </button>
              <button type="button" className="btn-primary flex-1" onClick={submit} disabled={busy}>
                이대로 제출하기
              </button>
            </div>
          )}
        </div>
      )}
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
