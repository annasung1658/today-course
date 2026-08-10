import { hours, responsePolicy } from '../config/policy';

/** 응답 마감 처리와 참여자 취향 집계. 순수 함수만 둔다. */

export type ParticipantStatus =
  | 'INVITED'
  | 'JOINED'
  | 'INTERVIEW_IN_PROGRESS'
  | 'INTERVIEW_COMPLETED'
  | 'NO_RESPONSE'
  | 'DECLINED';

export interface ParticipantSnapshot {
  participantId: string;
  userId: string;
  status: ParticipantStatus;
}

/** 약속 생성 시각 기준 기본 응답 마감. */
export function defaultResponseDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + hours(responsePolicy.defaultDeadlineHours));
}

export type CloseResponsesOutcome =
  | { outcome: 'GENERATE'; submittedUserIds: string[]; noResponseParticipantIds: string[] }
  | { outcome: 'NO_SUBMISSION'; noResponseParticipantIds: string[] };

/**
 * 응답 마감 시각에 실행한다.
 * 제출자가 한 명이라도 있으면 제출된 응답만으로 생성을 진행하고,
 * 아무도 제출하지 않았다면 방장에게 선택지를 넘긴다(연장 / 기본 코스 / 취소).
 */
export function closeResponses(participants: ParticipantSnapshot[]): CloseResponsesOutcome {
  const submitted = participants.filter((p) => p.status === 'INTERVIEW_COMPLETED');
  const noResponse = participants.filter(
    (p) => p.status === 'JOINED' || p.status === 'INTERVIEW_IN_PROGRESS' || p.status === 'INVITED',
  );
  const noResponseParticipantIds = noResponse.map((p) => p.participantId);

  if (submitted.length === 0) return { outcome: 'NO_SUBMISSION', noResponseParticipantIds };
  return {
    outcome: 'GENERATE',
    submittedUserIds: submitted.map((p) => p.userId),
    noResponseParticipantIds,
  };
}

/**
 * 투표 대상 인원. 과반수 계산의 분모다.
 * 거절자와 미응답자는 제외하고, 실제로 취향을 제출한 참여자만 센다.
 */
export function eligibleVoterCount(participants: ParticipantSnapshot[]): number {
  return participants.filter((p) => p.status === 'INTERVIEW_COMPLETED').length;
}

/** 마감 리마인더를 보낼 시각들. */
export function reminderTimes(deadlineAt: Date): Date[] {
  return responsePolicy.reminderMinutesBefore.map((m) => new Date(deadlineAt.getTime() - m * 60_000));
}

// ── 취향 집계 ────────────────────────────────────────────────────────

export interface ExtractedPreference {
  /** 익명 ID. AI에는 실명·이메일을 넘기지 않는다. */
  anonymousParticipantId: string;
  preferredFoods: string[];
  dislikedFoods: string[];
  allergies: string[];
  preferredActivities: string[];
  preferredAtmospheres: string[];
  budget: { min: number; max: number; currency: string } | null;
  mustHave: string[];
  mustAvoid: string[];
}

export interface AggregatedPreference {
  /** 선호 음식: 언급 횟수 내림차순 */
  preferredFoods: Array<{ tag: string; count: number }>;
  /** 한 명이라도 싫다고 하면 회피 대상 */
  dislikedFoods: string[];
  /** 안전조건. 선호보다 항상 우선한다. */
  allergies: string[];
  preferredActivities: Array<{ tag: string; count: number }>;
  preferredAtmospheres: Array<{ tag: string; count: number }>;
  /** 전원이 감당 가능한 교집합 예산 */
  budget: { min: number; max: number; currency: string } | null;
  /** 한 명이라도 필수로 걸면 전체 필수조건 */
  mustHave: string[];
  mustAvoid: string[];
  participantCount: number;
}

function tally(lists: string[][]): Array<{ tag: string; count: number }> {
  const map = new Map<string, number>();
  for (const list of lists) {
    for (const tag of new Set(list)) map.set(tag, (map.get(tag) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function unionOf(lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

/**
 * 제출된 응답만 공평하게 집계한다.
 * 알레르기·필수조건은 합집합(한 명이라도 걸리면 전체 적용),
 * 예산은 교집합에 가깝게 좁혀 아무도 부담되지 않게 만든다.
 */
export function aggregatePreferences(inputs: ExtractedPreference[]): AggregatedPreference {
  const budgets = inputs.map((i) => i.budget).filter((b): b is NonNullable<typeof b> => b !== null);

  let budget: AggregatedPreference['budget'] = null;
  if (budgets.length > 0) {
    // 가장 높은 최소값과 가장 낮은 최대값 → 교집합. 뒤집히면 최저 상한을 따른다.
    const min = Math.max(...budgets.map((b) => b.min));
    const max = Math.min(...budgets.map((b) => b.max));
    const currency = budgets[0]!.currency;
    budget = min <= max ? { min, max, currency } : { min: Math.min(...budgets.map((b) => b.min)), max, currency };
  }

  return {
    preferredFoods: tally(inputs.map((i) => i.preferredFoods)),
    dislikedFoods: unionOf(inputs.map((i) => i.dislikedFoods)),
    allergies: unionOf(inputs.map((i) => i.allergies)),
    preferredActivities: tally(inputs.map((i) => i.preferredActivities)),
    preferredAtmospheres: tally(inputs.map((i) => i.preferredAtmospheres)),
    budget,
    mustHave: unionOf(inputs.map((i) => i.mustHave)),
    mustAvoid: unionOf(inputs.map((i) => i.mustAvoid)),
    participantCount: inputs.length,
  };
}
