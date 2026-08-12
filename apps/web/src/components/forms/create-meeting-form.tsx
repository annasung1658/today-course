'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';
import { categoryLabels } from '@/lib/format';
import { PlaceSearchInput } from '@/components/place-search-input';
import { DateTimeStepInput } from '@/components/date-time-step-input';

interface FixedScheduleDraft {
  title: string;
  startAt: string;
  endAt: string;
  placeName: string;
  address: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string;
}

const FIXED_SCHEDULE_CATEGORIES = Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>;

const RELATIONSHIPS = [
  { value: 'COUPLE', label: '연인' },
  { value: 'FAMILY', label: '가족' },
  { value: 'FRIENDS', label: '친구' },
  { value: 'COWORKERS', label: '회사' },
  { value: 'CLUB', label: '동호회' },
];

const ATMOSPHERES = [
  { value: 'QUIET', label: '조용한' },
  { value: 'CASUAL', label: '편안한' },
  { value: 'TRENDY', label: '트렌디한' },
  { value: 'SPECIAL', label: '특별한' },
];

function getTodayMinimum() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00`;
}

function isAllowedDateTime(value: string, minimum: string) {
  return !value || value >= minimum;
}

/** 약속 만들기. 픽스 일정은 AI가 바꿀 수 없다는 점을 화면에서 분명히 말한다. */
export function CreateMeetingForm({ kakaoJsKey = null }: { kakaoJsKey?: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [areaName, setAreaName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [relationshipTags, setRelationshipTags] = useState<string[]>([]);
  const [atmosphereTags, setAtmosphereTags] = useState<string[]>([]);
  const [specialNotes, setSpecialNotes] = useState('');
  const [fixedSchedules, setFixedSchedules] = useState<FixedScheduleDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [minimumDateTime] = useState(getTodayMinimum);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: string }>('/meetings', {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
        body: JSON.stringify({
          title,
          scheduledStartAt: new Date(startAt).toISOString(),
          scheduledEndAt: new Date(endAt).toISOString(),
          area: { name: areaName },
          capacity,
          relationshipTags,
          atmosphereTags,
          specialNotes: specialNotes || undefined,
          fixedSchedules: fixedSchedules.map((f) => ({
            title: f.title,
            startAt: new Date(f.startAt).toISOString(),
            endAt: new Date(f.endAt).toISOString(),
            placeName: f.placeName,
            address: f.address ?? undefined,
            placeId: f.placeId ?? undefined,
            latitude: f.latitude ?? undefined,
            longitude: f.longitude ?? undefined,
            category: f.category,
          })),
        }),
      });
      router.push(`/meetings/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '약속을 만들지 못했어요.');
    } finally {
      setSubmitting(false);
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
          required
          maxLength={60}
          placeholder="예: 토요일 성수 나들이"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startAt">
            시작
          </label>
          <DateTimeStepInput
            id="startAt"
            min={minimumDateTime}
            value={startAt}
            onChange={(next) => {
              if (!isAllowedDateTime(next, minimumDateTime)) return;
              setStartAt(next);
              if (endAt && endAt < next) setEndAt('');
            }}
            required
          />
          <p className="mt-1.5 text-xs text-ink-400">오늘부터 선택할 수 있고, 시간은 10분 단위예요.</p>
        </div>
        <div>
          <label className="label" htmlFor="endAt">
            종료
          </label>
          <DateTimeStepInput
            id="endAt"
            min={startAt || minimumDateTime}
            value={endAt}
            onChange={(next) => {
              if (isAllowedDateTime(next, startAt || minimumDateTime)) setEndAt(next);
            }}
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
            required
            placeholder="예: 성수동"
          />
        </div>
        <div>
          <label className="label" htmlFor="capacity">
            인원
          </label>
          <input
            id="capacity"
            type="number"
            className="field"
            min={2}
            max={12}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            required
          />
        </div>
      </div>

      <TagPicker
        legend="누구와 만나나요"
        options={RELATIONSHIPS}
        selected={relationshipTags}
        onToggle={(v) => toggle(relationshipTags, setRelationshipTags, v)}
      />
      <TagPicker
        legend="어떤 분위기를 원하나요"
        options={ATMOSPHERES}
        selected={atmosphereTags}
        onToggle={(v) => toggle(atmosphereTags, setAtmosphereTags, v)}
      />

      <fieldset>
        <legend className="label">이미 정해진 일정</legend>
        <p className="mb-2 text-xs text-ink-500">
          여기 넣은 일정은 AI가 지우거나 시간을 옮기지 않아요. 나머지 시간만 채워드려요.
        </p>
        <div className="space-y-3">
          {fixedSchedules.map((schedule, index) => (
            <div key={index} className="card space-y-2 p-3">
              <input
                className="field"
                placeholder="일정 이름 (예: 영화 예매)"
                value={schedule.title}
                onChange={(e) =>
                  setFixedSchedules((list) =>
                    list.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)),
                  )
                }
                required
              />
              <PlaceSearchInput
                apiKey={kakaoJsKey}
                value={schedule.placeName}
                onSelect={(place) =>
                  setFixedSchedules((list) =>
                    list.map((s, i) =>
                      i === index
                        ? {
                            ...s,
                            placeName: place.placeName,
                            address: place.address,
                            placeId: place.placeId,
                            latitude: place.latitude,
                            longitude: place.longitude,
                          }
                        : s,
                    ),
                  )
                }
              />
              {kakaoJsKey && schedule.address && <p className="text-xs text-ink-500">{schedule.address}</p>}
              <select
                className="field"
                value={schedule.category}
                onChange={(e) =>
                  setFixedSchedules((list) =>
                    list.map((s, i) => (i === index ? { ...s, category: e.target.value } : s)),
                  )
                }
              >
                {FIXED_SCHEDULE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </select>
              <div className="grid gap-2 sm:grid-cols-2">
                <DateTimeStepInput
                  min={startAt || minimumDateTime}
                  max={endAt || undefined}
                  value={schedule.startAt}
                  onChange={(next) => {
                    if (!isAllowedDateTime(next, startAt || minimumDateTime)) return;
                    setFixedSchedules((list) => list.map((s, i) => i === index ? {
                      ...s, startAt: next, endAt: s.endAt && s.endAt < next ? '' : s.endAt,
                    } : s));
                  }}
                  required
                />
                <DateTimeStepInput
                  min={schedule.startAt || startAt || minimumDateTime}
                  max={endAt || undefined}
                  value={schedule.endAt}
                  onChange={(next) => {
                    if (!isAllowedDateTime(next, schedule.startAt || startAt || minimumDateTime)) return;
                    setFixedSchedules((list) => list.map((s, i) => i === index ? { ...s, endAt: next } : s));
                  }}
                  required
                />
              </div>
              <button
                type="button"
                className="btn-ghost text-danger-600"
                onClick={() => setFixedSchedules((list) => list.filter((_, i) => i !== index))}
              >
                일정 삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setFixedSchedules((list) => [
                ...list,
                {
                  title: '',
                  startAt: '',
                  endAt: '',
                  placeName: '',
                  address: null,
                  placeId: null,
                  latitude: null,
                  longitude: null,
                  category: 'ACTIVITY',
                },
              ])
            }
          >
            일정 추가
          </button>
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="specialNotes">
          미리 알려둘 점
        </label>
        <textarea
          id="specialNotes"
          className="field min-h-24"
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          maxLength={1000}
          placeholder="예: 한 명이 강아지를 데려와요"
        />
      </div>

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
        {submitting ? '만드는 중' : '약속 만들기'}
      </button>
    </form>
  );
}

function TagPicker({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              className={`chip transition-colors ${
                active
                  ? 'border-accent-600 bg-accent-50 text-accent-700'
                  : 'border-ink-200 text-ink-700 hover:bg-ink-50'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
