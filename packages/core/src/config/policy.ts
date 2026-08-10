/**
 * 서비스 정책값 단일 출처(Single Source of Truth).
 *
 * 지시서 §5: "중요한 정책값을 코드 여러 곳에 흩어놓지 말고 설정 파일로 관리하세요."
 * 이 파일 밖에서 60, 10, 2 같은 숫자를 직접 쓰지 말 것.
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

export const votingPolicy = {
  /** 1차 투표 창 길이(분). 코스 생성 완료 시점 기준. */
  initialWindowMinutes: 60,
  /** 재생성된 항목의 재투표 창 길이(분). 재생성 완료 시점 기준. */
  revoteWindowMinutes: 10,
  /** 항목당 최대 재생성 횟수. 도달 시 LOCKED 처리하고 현재 장소를 유지한다. */
  maxRegenerationPerItem: 2,
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
  /** 한 코스에 담기는 항목 수 범위. */
  minCourseItems: 3,
  maxCourseItems: 6,
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
