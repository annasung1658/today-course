'use client';

import { useEffect, useState } from 'react';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '10', '20', '30', '40', '50'];

function splitValue(value: string) {
  const [date = '', time = ''] = value.split('T');
  const [hour = '', minute = ''] = time.split(':');
  return { date, hour, minute };
}

/**
 * `datetime-local`의 대안. 네이티브 `datetime-local`은 `step`을 줘도 브라우저 피커의 분
 * 스피너가 이를 무시하고 1분 단위로 보여주는 경우가 많아서, 날짜 입력 + 시/분(10분 단위
 * 고정 옵션) 셀렉트로 직접 구성한다. 값 형식은 기존 `datetime-local`과 동일한
 * "YYYY-MM-DDTHH:mm" 문자열이라, 문자열 비교로 min/max를 검사하던 기존 로직을 그대로 쓸 수 있다.
 *
 * 날짜/시/분을 부모의 `value` 문자열에서 그때그때 파생하지 않고 내부 상태로 따로 들고 있다.
 * 세 칸이 모두 채워져야 완전한 값이 되는데, 부모가 min/max 검증 후 값을 거부(그대로 무시)할
 * 수 있어서 — 예: 종료일을 시작일과 같은 날로 처음 고르면 시/분이 아직 비어 있는 채로 조합이
 * 완성돼 버려 부모의 min 검증에 걸릴 수 있다 — 파생 상태로 만들면 그 순간 방금 고른 날짜
 * 선택 자체가 화면에서 사라져 버린다(실제로 겪은 버그). 내부 상태로 분리해두면 부모가 값을
 * 아직 못 받아도 사용자가 고른 낱개 선택은 화면에 그대로 남는다.
 */
export function DateTimeStepInput({
  id,
  value,
  min,
  max,
  onChange,
  required,
}: {
  id?: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [{ date, hour, minute }, setParts] = useState(() => splitValue(value));

  useEffect(() => {
    setParts(splitValue(value));
  }, [value]);

  const minDate = min ? splitValue(min).date : undefined;
  const maxDate = max ? splitValue(max).date : undefined;

  const commit = (nextDate: string, nextHour: string, nextMinute: string) => {
    setParts({ date: nextDate, hour: nextHour, minute: nextMinute });
    if (nextDate && nextHour && nextMinute) onChange(`${nextDate}T${nextHour}:${nextMinute}`);
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2">
      <input
        id={id}
        type="date"
        className="field"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => commit(e.target.value, hour, minute)}
        required={required}
      />
      <select
        className="field"
        value={hour}
        onChange={(e) => commit(date, e.target.value, minute)}
        required={required}
        aria-label="시"
      >
        <option value="" disabled>
          시
        </option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}시
          </option>
        ))}
      </select>
      <select
        className="field"
        value={minute}
        onChange={(e) => commit(date, hour, e.target.value)}
        required={required}
        aria-label="분"
      >
        <option value="" disabled>
          분
        </option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}분
          </option>
        ))}
      </select>
    </div>
  );
}
