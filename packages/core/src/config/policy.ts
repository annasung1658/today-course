/**
 * 서비스 정책값 단일 출처(Single Source of Truth).
 *
 * 지시서 §5: "중요한 정책값을 코드 여러 곳에 흩어놓지 말고 설정 파일로 관리하세요."
 * 이 파일 밖에서 60, 10, 3 같은 숫자를 직접 쓰지 말 것.
 *
 * ── 투표 시간 정책 (2026-08-10 확정) ──────────────────────────────
 * 기획서에는 "1시간 투표", API 명세 v1에는 "10분 투표"가 적혀 있었으나
 * 두 문서 모두 구버전이다. 확정된 규칙은 다음과 같다.
 *
 *   1) 1차 투표: 코스 생성 완료 시점부터 60분.
 *      → Course.votingEndsAt. 어떤 경우에도 변경하지 않는다.
 *   2) 재투표: 항목이 과반수 싫어요로 재생성되면, 새로 교체된 그 항목에
 *      한해 재생성 완료 시점부터 10분의 재투표 창이 열린다.
 *      → CourseItem.revoteEndsAt = min(now + 10분, course.votingEndsAt)
 *   3) 코스 전체 자동 확정 시각은 언제나 votingEndsAt 하나로만 판정한다.
 *      재투표는 코스 확정 시각을 앞당기지도 늦추지도 않는다.
 *
 * 즉 재투표 창은 "항목 단위로 더 짧게 닫히는 창"이지 코스 타이머가 아니다.
 */

import type { CourseItemCategory } from '../domain/course';

export const votingPolicy = {
  /** 1차 투표 창 길이(분). 코스 생성 완료 시점 기준. */
  initialWindowMinutes: 60,
  /** 재생성된 항목의 재투표 창 길이(분). 재생성 완료 시점 기준. */
  revoteWindowMinutes: 10,
  /** 항목당 최대 재생성 횟수. 도달 시 LOCKED 처리하고 현재 장소를 유지한다. */
  maxRegenerationPerItem: 3,
  /** 확정 직전 재생성이 진행 중일 때 결과를 기다려주는 유예시간(초). */
  finalizeGracePeriodSeconds: 20,
  /** 투표 종료 임박 알림 시점(분 단위, 종료 전). */
  endingSoonNoticeMinutes: 3,
} as const;

export const responsePolicy = {
  /** 약속 생성 후 기본 응답 마감까지의 시간(시간). 방장이 변경 가능. */
  defaultDeadlineHours: 5,
  /** 응답 마감 리마인더 시점(분 단위, 마감 전). */
  reminderMinutesBefore: [60, 10],
  /** 미응답자의 장기 기본 설정을 자동으로 끌어다 쓰지 않는다. */
  useDefaultPreferencesForNonResponders: false,
} as const;

export const interviewPolicy = {
  /** 핵심 질문 수. */
  questionCount: 4,
  /** 추가 확인 질문을 포함한 최대 대화 턴. */
  maxTurns: 5,
} as const;

export const aiPolicy = {
  /** 스키마 검증 실패 시 재생성 시도 횟수. */
  maxValidationRetries: 3,
  /** 한 코스에 담기는 항목 수 범위(짧은 모임 기준 기본값). 긴 모임은 scaledMaxCourseItems로 늘어난다. */
  minCourseItems: 3,
  maxCourseItems: 6,
  /** 아무리 긴 모임이라도 넘지 않는 절대 상한(스키마 검증 상한과 동일하게 맞춘다). */
  hardMaxCourseItems: 10,
} as const;

/**
 * 모임 길이에 비례해 코스 항목 상한을 늘린다.
 * 기본 maxCourseItems(6개)는 2~3시간짜리 짧은 모임 기준이라, 훨씬 긴 모임(예: 11시간)에
 * 그대로 적용하면 뒷시간대(저녁~새벽)가 항목 없이 통째로 비어버린다. 카테고리 평균
 * 체류시간(courseSlotPolicy.categoryDurationMinutes 평균, 약 65분)으로 모임 길이를 나눠
 * 필요한 항목 수를 추정하되, hardMaxCourseItems를 넘지 않는다.
 */
export function scaledMaxCourseItems(meetingDurationMinutes: number): number {
  const averageItemMinutes = 65;
  const scaled = Math.ceil(meetingDurationMinutes / averageItemMinutes);
  return Math.min(aiPolicy.hardMaxCourseItems, Math.max(aiPolicy.maxCourseItems, scaled));
}

/**
 * 시간대별 코스 슬롯 정책 (2026-08-12 확정).
 *
 * 약속의 시작~종료 시각을 이 시간대(밴드)들을 따라 훑으면서, 밴드 하나당 슬롯을
 * 하나씩 만든다 — 밴드 폭이 넓어도(예: 14~17시) 그 안에서 여러 곳을 들르지 않고
 * 딱 1곳만 고른 뒤 다음 밴드로 넘어간다. 그래야 "9시 시작 18시 종료"처럼 넓은
 * 구간의 약속이 아침부터 저녁까지 자연스럽게 이어진다.
 *
 * 한 밴드에 카테고리가 여러 개면(예: 카페/산책/체험) 참가자들이 가장 많이 원한
 * 카테고리를 고르고, 아무도 안 원했으면 배열에 적힌 순서상 첫 번째를 쓴다.
 */
export interface TimeBand {
  startHour: number;
  /** 배타적 경계. 마지막 밴드는 다음날 새벽까지 이어지도록 24를 넘겨(31=다음날 07시) 표기한다. */
  endHour: number;
  categories: CourseItemCategory[];
}

export const courseSlotPolicy = {
  timeBands: [
    { startHour: 7, endHour: 9, categories: ['BREAKFAST'] },
    { startHour: 9, endHour: 11, categories: ['CAFE', 'WALK', 'ACTIVITY'] },
    { startHour: 11, endHour: 14, categories: ['LUNCH'] },
    { startHour: 14, endHour: 17, categories: ['EXHIBITION', 'ACTIVITY', 'SHOPPING', 'WALK', 'CAFE'] },
    { startHour: 17, endHour: 19, categories: ['DINNER'] },
    { startHour: 19, endHour: 31, categories: ['CAFE', 'BAR', 'WALK'] },
  ] as TimeBand[],
  /** 카테고리별 평균 체류시간(분). */
  categoryDurationMinutes: {
    BREAKFAST: 60,
    CAFE: 60,
    LUNCH: 80,
    DINNER: 90,
    WALK: 50,
    EXHIBITION: 60,
    ACTIVITY: 60,
    SHOPPING: 50,
    BAR: 90,
  } as Record<CourseItemCategory, number>,
  /**
   * 픽스 일정 시작 직전에 남겨두는 최소 이동시간 여유(분).
   * 슬롯 배치는 이동시간을 모르는 채로(0분 가정) 계획을 짜고, 실제 이동시간은 장소가
   * 정해진 뒤에야 계산된다. 여유 없이 픽스 일정 시작 시각까지 딱 맞춰 계획하면, 실제
   * 이동시간이 조금만 있어도 바로 앞 슬롯이 픽스 일정 위로 밀려서 겹침 검증에 항상
   * 실패한다(실제로 겪은 버그) — 그래서 계획 단계에서부터 이 여유를 미리 빼둔다.
   */
  preFixedBufferMinutes: 15,
} as const;

export const invitationPolicy = {
  /** 초대 링크 기본 유효기간(시간). 약속 시작시간을 넘지 않도록 캡한다. */
  defaultTtlHours: 72,
  inviteCodeLength: 8,
} as const;

export const idempotencyPolicy = {
  /** Idempotency-Key 보관 기간(시간). */
  retentionHours: 24,
} as const;

export const meetingPolicy = {
  minCapacity: 2,
  maxCapacity: 12,
} as const;

/** 분 → 밀리초 */
export const minutes = (n: number) => n * 60_000;
/** 시간 → 밀리초 */
export const hours = (n: number) => n * 3_600_000;
