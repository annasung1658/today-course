/** API 명세 §4.6의 오류 코드. 코드와 HTTP 상태를 한 곳에서 관리한다. */
export const errorCatalog = {
  VALIDATION_ERROR: { status: 400, message: '입력값을 다시 확인해 주세요.' },
  UNAUTHORIZED: { status: 401, message: '로그인이 필요합니다.' },
  FORBIDDEN: { status: 403, message: '권한이 없습니다.' },
  RESOURCE_NOT_FOUND: { status: 404, message: '요청한 정보를 찾을 수 없습니다.' },
  MEETING_NOT_FOUND: { status: 404, message: '약속방을 찾을 수 없습니다.' },
  ALREADY_PROCESSED: { status: 409, message: '이미 처리된 요청입니다.' },
  INVALID_MEETING_STATUS: { status: 409, message: '지금 약속 상태에서는 할 수 없는 작업입니다.' },
  STALE_COURSE_ITEM: { status: 409, message: '코스가 이미 교체되었습니다. 새로고침 후 다시 투표해 주세요.' },
  CAPACITY_EXCEEDED: { status: 409, message: '참여 인원이 가득 찼습니다.' },
  INVITATION_EXPIRED: { status: 410, message: '초대 링크가 만료되었습니다.' },
  RESPONSE_DEADLINE_PASSED: { status: 410, message: '취향 응답이 마감되었습니다.' },
  VOTING_CLOSED: { status: 410, message: '투표가 종료되었습니다.' },
  REVOTE_WINDOW_CLOSED: { status: 410, message: '이 항목의 재투표 시간이 끝났습니다.' },
  INTERVIEW_INCOMPLETE: { status: 422, message: '인터뷰를 끝까지 진행해 주세요.' },
  SAFETY_CONSTRAINT_UNVERIFIED: { status: 422, message: '알레르기·애견동반 조건을 확인할 수 있는 장소를 찾지 못했습니다.' },
  REGENERATION_LIMIT_REACHED: { status: 422, message: '이 항목은 재생성 횟수를 모두 사용했습니다.' },
  RATE_LIMITED: { status: 429, message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  AI_GENERATION_FAILED: { status: 500, message: '코스를 만들지 못했습니다. 다시 시도해 주세요.' },
  INTERNAL_ERROR: { status: 500, message: '알 수 없는 오류가 발생했습니다.' },
} as const;

export type ErrorCode = keyof typeof errorCatalog;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, details?: Record<string, unknown>, messageOverride?: string) {
    const entry = errorCatalog[code];
    super(messageOverride ?? entry.message);
    this.name = 'ApiError';
    this.code = code;
    this.status = entry.status;
    this.details = details;
  }
}

export const apiError = (code: ErrorCode, details?: Record<string, unknown>, message?: string) =>
  new ApiError(code, details, message);
