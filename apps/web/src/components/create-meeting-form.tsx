'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';
import { cn } from '@/lib/cn';

interface Option {
  value: string;
  label: string;
}

interface FixedScheduleDraft {
  title: string;
  startAt: string;
  endAt: string;
  placeName: string;
}

/** 로컬 datetime-local 값을 ISO로 바꾼다. 브라우저 타임존을 그대로 쓴다. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : '');

export function CreateMeetingForm({
  relationships,
  atmospheres,
}: {
  relationships: Option[];
  atmospheres: Option[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [areaName, setAreaName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [relationshipTags, setRelationshipTags] = useState<string[]>([]);
  const [atmosphereTags, setAtmosphereTags] = useState<string[]>([]);
  const [specialNotes, setSpecialNotes] = useState('');
  const [deadline, setDeadline] = useState('');
  const [fixedSchedules, setFixedSchedules] = useState<FixedScheduleDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], setter: (v: string[]) => void, value: string) =>
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ id: string }>('/meetings', {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
        body: JSON.stringify({
          title,
          scheduledStartAt: toIso(startAt),
          scheduledEndAt: toIso(endAt),
          area: { name: areaName },
          capacity,
          relationshipTags,
          atmosphereTags,
          specialNotes: specialNotes || undefined,
          responseDeadlineAt: deadline ? toIso(deadline) : undefined,
          fixedSchedules: fixedSchedules
            .filter((f) => f.title && f.startAt && f.endAt && f.placeName)
            .map((f) => ({
              title: f.title,
              startAt: toIso(f.startAt),
              endAt: toIso(f.endAt),
              placeName: f.placeName,
            })),
        }),
      });
      router.push(`/meetings/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '약속을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <ErrorNotice message={error} />}

      <div>
        <label className="label" htmlFor="title">
          모임 이름
        </label>
        <input
          id="title"
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 토요일 성수 모임"
          required
          maxLength={60}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startAt">
            시작
          </label>
          <input
            id="startAt"
            type="datetime-local"
            className="field"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="endAt">
            종료
          </label>
          <input
            id="endAt"
            type="datetime-local"
            className="field"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="areaName">
            만날 지역
          </label>
          <input
            id="areaName"
            className="field"
            value={areaName}
            onChange={(e) => setAreaName(e.target.value)}
            placeholder="예: 성수동"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="capacity">
            인원
          </label>
          <input
            id="capacity"
            type="number"
            min={2}
            max={12}
            className="field"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            required
          />
        </div>
      </div>

      <fieldset>
        <legend className="label">누구와 만나나요</legend>
        <div className="flex flex-wrap gap-2">
          {relationships.map((option) => (
            <TagButton
              key={option.value}
              label={option.label}
              active={relationshipTags.includes(option.value)}
              onClick={() => toggle(relationshipTags, setRelationshipTags, option.value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">어떤 분위기를 원하나요</legend>
        <div className="flex flex-wrap gap-2">
          {atmospheres.map((option) => (
            <TagButton
              key={option.value}
              label={option.label}
              active={atmosphereTags.includes(option.value)}
              onClick={() => toggle(atmosphereTags, setAtmosphereTags, option.value)}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">이미 정해둔 일정</span>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() =>
              setFixedSchedules([...fixedSchedules, { title: '', startAt: '', endAt: '', placeName: '' }])
            }
          >
            일정 추가
          </button>
        </div>
        <p className="mb-3 text-xs text-ink-500">
          여기에 넣은 일정은 AI가 지우거나 시간을 바꾸지 않고, 그 사이에 맞춰 코스를 짜요.
        </p>

        {fixedSchedules.map((schedule, index) => (
          <div key={index} className="card mb-2 space-y-2 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="field"
                placeholder="일정 이름 (예: 영화 예매)"
                value={schedule.title}
                onChange={(e) => {
                  const next = [...fixedSchedules];
                  next[index] = { ...next[index]!, title: e.target.value };
                  setFixedSchedules(next);
                }}
              />
              <input
                className="field"
                placeholder="장소 이름"
                value={schedule.placeName}
                onChange={(e) => {
                  const next = [...fixedSchedules];
                  next[index] = { ...next[index]!, placeName: e.target.value };
                  setFixedSchedules(next);
                }}
              />
              <input
                type="datetime-local"
                className="field"
                value={schedule.startAt}
                onChange={(e) => {
                  const next = [...fixedSchedules];
                  next[index] = { ...next[index]!, startAt: e.target.value };
                  setFixedSchedules(next);
                }}
              />
              <input
                type="datetime-local"
                className="field"
                value={schedule.endAt}
                onChange={(e) => {
                  const next = [...fixedSchedules];
                  next[index] = { ...next[index]!, endAt: e.target.value };
                  setFixedSchedules(next);
                }}
              />
            </div>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-danger-600"
              onClick={() => setFixedSchedules(fixedSchedules.filter((_, i) => i !== index))}
            >
              이 일정 빼기
            </button>
          </div>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="deadline">
          취향 응답 마감
        </label>
        <input
          id="deadline"
          type="datetime-local"
          className="field"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-ink-500">비워두면 지금부터 5시간 뒤로 정해요.</p>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          미리 알려둘 점
        </label>
        <textarea
          id="notes"
          className="field min-h-24"
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          placeholder="예: 한 명이 강아지를 데려와요"
          maxLength={1000}
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? '만드는 중' : '약속 만들기'}
      </button>
    </form>
  );
}

function TagButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'chip transition-colors',
        active ? 'border-accent-600 bg-accent-50 text-accent-700' : 'border-ink-200 text-ink-700 hover:bg-ink-50',
      )}
    >
      {label}
    </button>
  );
}
