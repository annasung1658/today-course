import { AggregatedPreference } from './responses';

/** 코스 후보 장소 필터링과 픽스 일정 보존 규칙. */

export type CourseItemCategory =
  | 'BREAKFAST'
  | 'CAFE'
  | 'LUNCH'
  | 'DINNER'
  | 'WALK'
  | 'EXHIBITION'
  | 'ACTIVITY'
  | 'SHOPPING'
  | 'BAR';

export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: CourseItemCategory;
  /** 애견동반 가능 여부. null이면 "확인 불가"이며 확인 불가는 통과시키지 않는다. */
  petFriendly: boolean | null;
  petFriendlyVerifiedAt: Date | null;
  /** 취급 알레르기 유발 재료. null이면 확인 불가. */
  allergenInfo: string[] | null;
  allergenVerifiedAt: Date | null;
  /** 요일별 영업시간. 0=일요일. */
  openingHours: Record<number, { open: string; close: string } | null>;
  averagePricePerPerson: number;
}

export interface PlaceFilterContext {
  aggregated: AggregatedPreference;
  /** 이 약속에서 이미 거절된 장소 */
  rejectedPlaceIds: string[];
  /** 같은 코스 안에서 이미 쓰인 장소 */
  usedPlaceIds: string[];
  /** 방문 예정 시각 */
  visitStartAt: Date;
  visitEndAt: Date;
}

export type RejectionReason =
  | 'BLACKLISTED'
  | 'DUPLICATE_IN_COURSE'
  | 'PET_FRIENDLY_UNVERIFIED'
  | 'ALLERGEN_UNVERIFIED'
  | 'ALLERGEN_PRESENT'
  | 'CLOSED_AT_VISIT_TIME'
  | 'OVER_BUDGET';

export interface FilterResult {
  accepted: PlaceCandidate[];
  rejected: Array<{ placeId: string; reason: RejectionReason }>;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * 이 서비스는 항상 한국 시간 기준으로 영업시간·모임 시간대를 판단해야 하는데,
 * Date.getHours()/getDay()는 실행 환경의 시스템 시간대를 따른다 — 로컬 개발 환경은
 * 우연히 KST라 문제가 안 보이지만, Vercel 서버리스는 기본이 UTC라 9시간 차이로
 * "오후 약속"이 "새벽"으로 판정되는 버그가 있었다. 그래서 항상 한국 시간대로 명시 계산한다.
 */
export function koreaTimeParts(date: Date): { hour: number; minute: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    day: WEEKDAY_INDEX[map.weekday!] ?? date.getDay(),
  };
}

function isOpenDuring(place: PlaceCandidate, startAt: Date, endAt: Date): boolean {
  const startParts = koreaTimeParts(startAt);
  const endParts = koreaTimeParts(endAt);
  const hours = place.openingHours[startParts.day];
  if (!hours) return false; // 휴무일이거나 정보 없음 → 추천하지 않는다.
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const start = startParts.hour * 60 + startParts.minute;
  const end = endParts.hour * 60 + endParts.minute;
  // 새벽까지 여는 가게(close < open)는 자정을 넘긴 것으로 본다.
  const closeAdjusted = close < open ? close + 24 * 60 : close;
  const endAdjusted = end < start ? end + 24 * 60 : end;
  return start >= open && endAdjusted <= closeAdjusted;
}

/**
 * 안전조건 우선 필터.
 * 알레르기와 애견동반은 "확인 가능한 경우에만 통과"시킨다.
 * 정보가 없는 장소(null)는 안전한 쪽으로 판단해 제외한다.
 */
export function filterPlaces(candidates: PlaceCandidate[], ctx: PlaceFilterContext): FilterResult {
  const accepted: PlaceCandidate[] = [];
  const rejected: FilterResult['rejected'] = [];
  const needsPetFriendly = ctx.aggregated.mustHave.includes('PET_FRIENDLY');
  const allergies = ctx.aggregated.allergies;
  const budgetMax = ctx.aggregated.budget?.max ?? null;

  for (const place of candidates) {
    const reject = (reason: RejectionReason) => rejected.push({ placeId: place.placeId, reason });

    if (ctx.rejectedPlaceIds.includes(place.placeId)) {
      reject('BLACKLISTED');
      continue;
    }
    if (ctx.usedPlaceIds.includes(place.placeId)) {
      reject('DUPLICATE_IN_COURSE');
      continue;
    }
    if (needsPetFriendly && (place.petFriendly !== true || place.petFriendlyVerifiedAt === null)) {
      reject('PET_FRIENDLY_UNVERIFIED');
      continue;
    }
    if (allergies.length > 0 && isFoodCategory(place.category)) {
      if (place.allergenInfo === null || place.allergenVerifiedAt === null) {
        reject('ALLERGEN_UNVERIFIED');
        continue;
      }
      if (place.allergenInfo.some((a) => allergies.includes(a))) {
        reject('ALLERGEN_PRESENT');
        continue;
      }
    }
    if (!isOpenDuring(place, ctx.visitStartAt, ctx.visitEndAt)) {
      reject('CLOSED_AT_VISIT_TIME');
      continue;
    }
    if (budgetMax !== null && place.averagePricePerPerson > budgetMax) {
      reject('OVER_BUDGET');
      continue;
    }
    accepted.push(place);
  }

  return { accepted, rejected };
}

export function isFoodCategory(category: CourseItemCategory): boolean {
  return (
    category === 'BREAKFAST' || category === 'LUNCH' || category === 'DINNER' || category === 'CAFE' || category === 'BAR'
  );
}

export interface FixedScheduleSlot {
  id: string;
  startAt: Date;
  endAt: Date;
  placeName: string;
  category: CourseItemCategory;
}

export interface DraftCourseItem {
  sequence: number;
  category: CourseItemCategory;
  startAt: Date;
  endAt: Date;
  placeId: string | null;
  fixedScheduleId: string | null;
}

/**
 * AI가 픽스 일정을 삭제하거나 시간·장소·카테고리를 바꾸지 않았는지 검증한다.
 * 하나라도 어긋나면 결과 전체를 버리고 재생성한다.
 */
export function validateFixedSchedulesPreserved(
  items: DraftCourseItem[],
  fixedSchedules: FixedScheduleSlot[],
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const fixed of fixedSchedules) {
    const match = items.find((i) => i.fixedScheduleId === fixed.id);
    if (!match) {
      violations.push(`픽스 일정 누락: ${fixed.placeName}`);
      continue;
    }
    if (match.startAt.getTime() !== fixed.startAt.getTime() || match.endAt.getTime() !== fixed.endAt.getTime()) {
      violations.push(`픽스 일정 시간 변경: ${fixed.placeName}`);
    }
    if (match.category !== fixed.category) {
      violations.push(`픽스 일정 카테고리 변경: ${fixed.placeName}`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/** 항목 시간이 겹치는지, 순서가 시간순인지 검증한다. */
export function validateItemTimeline(items: DraftCourseItem[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const sorted = [...items].sort((a, b) => a.sequence - b.sequence);

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    if (current.endAt.getTime() <= current.startAt.getTime()) {
      violations.push(`${current.sequence}번 항목의 종료시간이 시작시간보다 빠릅니다.`);
    }
    const next = sorted[i + 1];
    if (next && next.startAt.getTime() < current.endAt.getTime()) {
      violations.push(`${current.sequence}번과 ${next.sequence}번 항목의 시간이 겹칩니다.`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * 부분 재생성 시 유지해야 하는 제약을 뽑아낸다.
 * 카테고리·시간대는 그대로 두고, 앞뒤 항목 사이에서만 새 장소를 찾는다.
 */
export function buildRegenerationConstraints(
  items: DraftCourseItem[],
  targetSequence: number,
): {
  category: CourseItemCategory;
  startAt: Date;
  endAt: Date;
  previousPlaceId: string | null;
  nextPlaceId: string | null;
  lockedPlaceIds: string[];
} | null {
  const sorted = [...items].sort((a, b) => a.sequence - b.sequence);
  const index = sorted.findIndex((i) => i.sequence === targetSequence);
  if (index === -1) return null;
  const target = sorted[index]!;

  return {
    category: target.category,
    startAt: target.startAt,
    endAt: target.endAt,
    previousPlaceId: sorted[index - 1]?.placeId ?? null,
    nextPlaceId: sorted[index + 1]?.placeId ?? null,
    lockedPlaceIds: sorted
      .filter((i) => i.sequence !== targetSequence)
      .map((i) => i.placeId)
      .filter((id): id is string => id !== null),
  };
}
