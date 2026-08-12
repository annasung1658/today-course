'use client';

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
  const { date, hour, minute } = splitValue(value);
  const minDate = min ? splitValue(min).date : undefined;
  const maxDate = max ? splitValue(max).date : undefined;

  const emit = (nextDate: string, nextHour: string, nextMinute: string) => {
    onChange(nextDate && nextHour && nextMinute ? `${nextDate}T${nextHour}:${nextMinute}` : '');
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
        onChange={(e) => emit(e.target.value, hour || '00', minute || '00')}
        required={required}
      />
      <select
        className="field"
        value={hour}
        onChange={(e) => emit(date, e.target.value, minute || '00')}
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
        onChange={(e) => emit(date, hour || '00', e.target.value)}
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
