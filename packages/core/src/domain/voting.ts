import { minutes, votingPolicy } from '../config/policy';

/**
 * 투표 도메인 로직. DB·HTTP·React에 의존하지 않는 순수 함수만 둔다.
 * 모든 시각 판정은 호출자가 넘겨준 `now`(서버 시간) 기준이다.
 */

export type VoteValue = 'LIKE' | 'DISLIKE';

export type CourseItemStatus =
  | 'ACTIVE'
  | 'REGENERATION_QUEUED'
  | 'REGENERATING'
  | 'REPLACED'
  | 'LOCKED';

export type VotingPhase = 'INITIAL' | 'REVOTE' | 'CLOSED';

/** 재생성 판정에 쓰는 싫어요 과반수 기준. floor(n / 2) + 1 */
export function requiredDislikeCount(eligibleParticipantCount: number): number {
  if (eligibleParticipantCount <= 0) return Number.POSITIVE_INFINITY;
  return Math.floor(eligibleParticipantCount / 2) + 1;
}

/** 코스 생성 완료 시점부터 1차 투표 종료 시각. 이후 절대 변경하지 않는다. */
export function calcVotingEndsAt(votingStartedAt: Date): Date {
  return new Date(votingStartedAt.getTime() + minutes(votingPolicy.initialWindowMinutes));
}

/**
 * 재생성이 완료된 항목의 재투표 종료 시각.
 * 코스 전체 종료시간(votingEndsAt)을 넘길 수 없다 — 재투표는 코스 타이머를 연장하지 않는다.
 */
export function calcItemRevoteEndsAt(regeneratedAt: Date, courseVotingEndsAt: Date): Date {
  const candidate = new Date(regeneratedAt.getTime() + minutes(votingPolicy.revoteWindowMinutes));
  return candidate.getTime() < courseVotingEndsAt.getTime() ? candidate : courseVotingEndsAt;
}

export interface ItemVotingWindow {
  /** 재생성으로 교체된 항목이면 재투표 종료 시각, 최초 항목이면 null */
  revoteEndsAt: Date | null;
  status: CourseItemStatus;
}

export interface CourseVotingWindow {
  votingStartedAt: Date;
  votingEndsAt: Date;
}

/** 코스 전체 투표가 아직 열려 있는지. 확정 판정은 오직 이 값만 본다. */
export function isCourseVotingOpen(course: CourseVotingWindow, now: Date): boolean {
  return now.getTime() >= course.votingStartedAt.getTime() && now.getTime() < course.votingEndsAt.getTime();
}

/** 특정 항목에 지금 투표할 수 있는지. 코스 창 + 항목 재투표 창 + 항목 상태를 모두 본다. */
export function canVoteOnItem(
  course: CourseVotingWindow,
  item: ItemVotingWindow,
  now: Date,
): { allowed: boolean; reason?: 'VOTING_CLOSED' | 'REVOTE_WINDOW_CLOSED' | 'ITEM_NOT_VOTABLE' } {
  if (!isCourseVotingOpen(course, now)) return { allowed: false, reason: 'VOTING_CLOSED' };
  if (item.status === 'REPLACED' || item.status === 'REGENERATION_QUEUED' || item.status === 'REGENERATING') {
    return { allowed: false, reason: 'ITEM_NOT_VOTABLE' };
  }
  if (item.revoteEndsAt && now.getTime() >= item.revoteEndsAt.getTime()) {
    return { allowed: false, reason: 'REVOTE_WINDOW_CLOSED' };
  }
  return { allowed: true };
}

/** 항목이 현재 어떤 투표 단계에 있는지. 화면 표시용. */
export function itemVotingPhase(
  course: CourseVotingWindow,
  item: ItemVotingWindow,
  now: Date,
): VotingPhase {
  if (!isCourseVotingOpen(course, now)) return 'CLOSED';
  if (!item.revoteEndsAt) return 'INITIAL';
  return now.getTime() < item.revoteEndsAt.getTime() ? 'REVOTE' : 'CLOSED';
}

/** 항목별 남은 초. 재투표 중인 항목은 더 짧은 창을 따른다. */
export function remainingSecondsForItem(
  course: CourseVotingWindow,
  item: ItemVotingWindow,
  now: Date,
): number {
  const courseRemain = course.votingEndsAt.getTime() - now.getTime();
  const itemRemain = item.revoteEndsAt ? item.revoteEndsAt.getTime() - now.getTime() : courseRemain;
  return Math.max(0, Math.floor(Math.min(courseRemain, itemRemain) / 1000));
}

/** 코스 확정까지 남은 초. */
export function remainingSecondsForCourse(course: CourseVotingWindow, now: Date): number {
  return Math.max(0, Math.floor((course.votingEndsAt.getTime() - now.getTime()) / 1000));
}

export interface RegenerationDecisionInput {
  dislikeCount: number;
  eligibleParticipantCount: number;
  regenerationCount: number;
  itemStatus: CourseItemStatus;
}

export type RegenerationDecision =
  | { action: 'NONE' }
  | { action: 'REGENERATE' }
  | { action: 'LOCK'; reason: 'MAX_REGENERATION_REACHED' };

/**
 * 투표 저장 직후 같은 트랜잭션 안에서 호출한다.
 * 싫어요 과반수에 도달했고 재생성 여유가 남아 있으면 재생성, 한도에 닿았으면 잠금.
 */
export function decideRegeneration(input: RegenerationDecisionInput): RegenerationDecision {
  const { dislikeCount, eligibleParticipantCount, regenerationCount, itemStatus } = input;
  if (itemStatus !== 'ACTIVE') return { action: 'NONE' };
  if (dislikeCount < requiredDislikeCount(eligibleParticipantCount)) return { action: 'NONE' };
  if (regenerationCount >= votingPolicy.maxRegenerationPerItem) {
    return { action: 'LOCK', reason: 'MAX_REGENERATION_REACHED' };
  }
  return { action: 'REGENERATE' };
}

/** 늦게 도착한 투표(교체 전 항목 대상)를 걸러낸다. */
export function isStaleVote(requestVersion: number, currentVersion: number): boolean {
  return requestVersion !== currentVersion;
}

/** 투표 대상자 전원이 현재 모든 투표 항목에 한 표씩 남겼는지 판정한다. */
export function haveAllEligibleVoted(
  eligibleUserIds: string[],
  items: Array<{ voterUserIds: string[] }>,
): boolean {
  if (eligibleUserIds.length === 0 || items.length === 0) return false;
  return items.every((item) => {
    const voters = new Set(item.voterUserIds);
    return eligibleUserIds.every((userId) => voters.has(userId));
  });
}

export interface FinalizeInput {
  course: CourseVotingWindow;
  now: Date;
  hasPendingRegeneration: boolean;
  /** 재생성 작업이 시작된 시각. 유예시간 판정에 쓴다. */
  pendingStartedAt: Date | null;
}

export type FinalizeDecision =
  | { action: 'WAIT'; untilAt: Date }
  | { action: 'FINALIZE' }
  | { action: 'NOT_YET' };

/**
 * 자동 확정 판정.
 * votingEndsAt이 지났고 진행 중인 재생성이 없으면 즉시 확정.
 * 재생성이 진행 중이면 짧은 유예시간만 기다렸다가, 실패하면 직전 정상 항목으로 확정한다.
 */
export function decideFinalize(input: FinalizeInput): FinalizeDecision {
  const { course, now, hasPendingRegeneration, pendingStartedAt } = input;
  if (now.getTime() < course.votingEndsAt.getTime()) return { action: 'NOT_YET' };
  if (!hasPendingRegeneration) return { action: 'FINALIZE' };

  const graceMs = votingPolicy.finalizeGracePeriodSeconds * 1000;
  const graceBase = pendingStartedAt ?? course.votingEndsAt;
  const graceUntil = new Date(Math.max(course.votingEndsAt.getTime(), graceBase.getTime()) + graceMs);
  return now.getTime() < graceUntil.getTime() ? { action: 'WAIT', untilAt: graceUntil } : { action: 'FINALIZE' };
}

/** mm:ss 표기. 화면과 테스트가 같은 함수를 쓴다. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
