'use client';

import { useState } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';
import { cn } from '@/lib/cn';

interface Option {
  value: string;
  label: string;
}

export interface PreferenceValue {
  preferredFoods: string[];
  dislikedFoods: string[];
  allergies: string[];
  preferredActivities: string[];
  preferredAtmospheres: string[];
  budget: { min: number; max: number; currency: string } | null;
  mustHave: string[];
  mustAvoid: string[];
  additionalNotes: string | null;
}

const EMPTY: PreferenceValue = {
  preferredFoods: [],
  dislikedFoods: [],
  allergies: [],
  preferredActivities: [],
  preferredAtmospheres: [],
  budget: null,
  mustHave: [],
  mustAvoid: [],
  additionalNotes: null,
};

export function PreferenceForm({
  initial,
  options,
}: {
  initial: PreferenceValue | null;
  options: Record<string, Option[]>;
}) {
  const [value, setValue] = useState<PreferenceValue>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (field: keyof PreferenceValue, tag: string) => {
    const current = value[field];
    if (!Array.isArray(current)) return;
    setValue({
      ...value,
      [field]: current.includes(tag) ? current.filter((v) => v !== tag) : [...current, tag],
    });
    setSaved(false);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/users/me/preferences', { method: 'PUT', body: JSON.stringify(value) });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      {error && <ErrorNotice message={error} />}

      <Group title="좋아하는 음식" options={options.foods ?? []} selected={value.preferredFoods} onToggle={(t) => toggle('preferredFoods', t)} />
      <Group title="피하고 싶은 음식" options={options.foods ?? []} selected={value.dislikedFoods} onToggle={(t) => toggle('dislikedFoods', t)} />
      <Group
        title="알레르기"
        description="안전과 직결되므로 코스를 만들 때 가장 먼저 지켜요."
        options={options.allergies ?? []}
        selected={value.allergies}
        onToggle={(t) => toggle('allergies', t)}
      />
      <Group title="좋아하는 활동" options={options.activities ?? []} selected={value.preferredActivities} onToggle={(t) => toggle('preferredActivities', t)} />
      <Group title="선호하는 분위기" options={options.atmospheres ?? []} selected={value.preferredAtmospheres} onToggle={(t) => toggle('preferredAtmospheres', t)} />
      <Group title="꼭 필요한 조건" options={options.mustHave ?? []} selected={value.mustHave} onToggle={(t) => toggle('mustHave', t)} />
      <Group title="꼭 피하고 싶은 것" options={options.mustAvoid ?? []} selected={value.mustAvoid} onToggle={(t) => toggle('mustAvoid', t)} />

      <div>
        <span className="label">1인 예산</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="field"
            placeholder="최소"
            min={0}
            step={1000}
            value={value.budget?.min ?? ''}
            onChange={(e) =>
              setValue({
                ...value,
                budget: {
                  min: Number(e.target.value),
                  max: value.budget?.max ?? Number(e.target.value),
                  currency: 'KRW',
                },
              })
            }
          />
          <span className="text-ink-300">–</span>
          <input
            type="number"
            className="field"
            placeholder="최대"
            min={0}
            step={1000}
            value={value.budget?.max ?? ''}
            onChange={(e) =>
              setValue({
                ...value,
                budget: {
                  min: value.budget?.min ?? 0,
                  max: Number(e.target.value),
                  currency: 'KRW',
                },
              })
            }
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          더 알려주고 싶은 점
        </label>
        <textarea
          id="notes"
          className="field min-h-24"
          value={value.additionalNotes ?? ''}
          onChange={(e) => setValue({ ...value, additionalNotes: e.target.value || null })}
          maxLength={1000}
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '저장 중' : '저장하기'}
        </button>
        {saved && <span className="text-sm font-medium text-good-600">저장했어요</span>}
      </div>
    </form>
  );
}

function Group({
  title,
  description,
  options,
  selected,
  onToggle,
}: {
  title: string;
  description?: string;
  options: Option[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{title}</legend>
      {description && <p className="mb-2 -mt-1 text-xs text-ink-500">{description}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected.includes(option.value)}
            onClick={() => onToggle(option.value)}
            className={cn(
              'chip transition-colors',
              selected.includes(option.value)
                ? 'border-accent-600 bg-accent-50 text-accent-700'
                : 'border-ink-200 text-ink-700 hover:bg-ink-50',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
