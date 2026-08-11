import { describe, expect, it } from 'vitest';
import {
  calcItemRevoteEndsAt,
  calcVotingEndsAt,
  canVoteOnItem,
  decideFinalize,
  decideRegeneration,
  formatCountdown,
  haveAllEligibleVoted,
  isCourseVotingOpen,
  isStaleVote,
  itemVotingPhase,
  remainingSecondsForCourse,
  remainingSecondsForItem,
  requiredDislikeCount,
} from './voting';

const at = (iso: string) => new Date(iso);
const START = at('2026-08-15T19:00:00Z');
const END = at('2026-08-15T20:00:00Z'); // 1시간 뒤
const course = { votingStartedAt: START, votingEndsAt: END };

describe('과반수 계산', () => {
  it('floor(n / 2) + 1 을 따른다', () => {
    expect(requiredDislikeCount(2)).toBe(2);
    expect(requiredDislikeCount(3)).toBe(2);
    expect(requiredDislikeCount(4)).toBe(3);
    expect(requiredDislikeCount(5)).toBe(3);
    expect(requiredDislikeCount(6)).toBe(4);
  });

  it('투표 대상이 없으면 어떤 값으로도 재생성되지 않는다', () => {
    expect(requiredDislikeCount(0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('1차 투표 창 (코스 생성 완료 + 60분)', () => {
  it('votingEndsAt은 시작 60분 뒤다', () => {
    expect(calcVotingEndsAt(START).toISOString()).toBe(END.toISOString());
  });

  it('10분이 아니라 60분이다', () => {
    const diffMinutes = (calcVotingEndsAt(START).getTime() - START.getTime()) / 60_000;
    expect(diffMinutes).toBe(60);
    expect(diffMinutes).not.toBe(10);
  });

  it('시작 전과 종료 후에는 닫혀 있다', () => {
    expect(isCourseVotingOpen(course, at('2026-08-15T18:59:59Z'))).toBe(false);
    expect(isCourseVotingOpen(course, at('2026-08-15T19:30:00Z'))).toBe(true);
    expect(isCourseVotingOpen(course, at('2026-08-15T20:00:00Z'))).toBe(false);
  });
});

describe('재투표 창 (재생성 완료 + 10분)', () => {
  it('재생성 완료 시점부터 10분이다', () => {
    const regeneratedAt = at('2026-08-15T19:05:00Z');
    expect(calcItemRevoteEndsAt(regeneratedAt, END).toISOString()).toBe(at('2026-08-15T19:15:00Z').toISOString());
  });

  it('코스 종료시간을 넘기지 않는다', () => {
    const regeneratedAt = at('2026-08-15T19:55:00Z'); // 남은 5분
    expect(calcItemRevoteEndsAt(regeneratedAt, END).toISOString()).toBe(END.toISOString());
  });

  it('재투표가 열려도 코스 종료시간은 그대로다', () => {
    const before = course.votingEndsAt.getTime();
    calcItemRevoteEndsAt(at('2026-08-15T19:05:00Z'), course.votingEndsAt);
    expect(course.votingEndsAt.getTime()).toBe(before);
    expect(remainingSecondsForCourse(course, at('2026-08-15T19:20:00Z'))).toBe(40 * 60);
  });
});

describe('항목별 투표 가능 여부', () => {
  const activeItem = { revoteEndsAt: null, status: 'ACTIVE' as const };

  it('최초 항목은 코스 창 동안 투표할 수 있다', () => {
    expect(canVoteOnItem(course, activeItem, at('2026-08-15T19:40:00Z')).allowed).toBe(true);
  });

  it('코스 투표가 끝나면 거절한다', () => {
    const result = canVoteOnItem(course, activeItem, at('2026-08-15T20:00:01Z'));
    expect(result).toEqual({ allowed: false, reason: 'VOTING_CLOSED' });
  });

  it('재투표 창이 닫힌 항목은 코스 창이 남아 있어도 거절한다', () => {
    const item = { revoteEndsAt: at('2026-08-15T19:15:00Z'), status: 'ACTIVE' as const };
    expect(canVoteOnItem(course, item, at('2026-08-15T19:14:59Z')).allowed).toBe(true);
    expect(canVoteOnItem(course, item, at('2026-08-15T19:16:00Z'))).toEqual({
      allowed: false,
      reason: 'REVOTE_WINDOW_CLOSED',
    });
  });

  it('재생성 중인 항목에는 투표할 수 없다', () => {
    const item = { revoteEndsAt: null, status: 'REGENERATING' as const };
    expect(canVoteOnItem(course, item, at('2026-08-15T19:10:00Z')).reason).toBe('ITEM_NOT_VOTABLE');
  });
});

describe('항목 단계와 남은 시간', () => {
  it('최초 항목은 INITIAL, 교체된 항목은 REVOTE다', () => {
    const now = at('2026-08-15T19:10:00Z');
    expect(itemVotingPhase(course, { revoteEndsAt: null, status: 'ACTIVE' }, now)).toBe('INITIAL');
    expect(
      itemVotingPhase(course, { revoteEndsAt: at('2026-08-15T19:15:00Z'), status: 'ACTIVE' }, now),
    ).toBe('REVOTE');
  });

  it('재투표 항목은 더 짧은 창의 남은 시간을 쓴다', () => {
    const now = at('2026-08-15T19:10:00Z');
    expect(remainingSecondsForItem(course, { revoteEndsAt: null, status: 'ACTIVE' }, now)).toBe(50 * 60);
    expect(
      remainingSecondsForItem(course, { revoteEndsAt: at('2026-08-15T19:15:00Z'), status: 'ACTIVE' }, now),
    ).toBe(5 * 60);
  });
});

describe('재생성 판정', () => {
  const base = { eligibleParticipantCount: 4, regenerationCount: 0, itemStatus: 'ACTIVE' as const };

  it('4명 중 싫어요 3명이면 재생성한다', () => {
    expect(decideRegeneration({ ...base, dislikeCount: 3 })).toEqual({ action: 'REGENERATE' });
  });

  it('4명 중 싫어요 2명이면 재생성하지 않는다', () => {
    expect(decideRegeneration({ ...base, dislikeCount: 2 })).toEqual({ action: 'NONE' });
  });

  it('3회 재생성한 항목은 잠근다', () => {
    expect(decideRegeneration({ ...base, dislikeCount: 4, regenerationCount: 3 })).toEqual({
      action: 'LOCK',
      reason: 'MAX_REGENERATION_REACHED',
    });
  });

  it('이미 잠긴 항목은 다시 재생성하지 않는다', () => {
    expect(decideRegeneration({ ...base, dislikeCount: 4, itemStatus: 'LOCKED' })).toEqual({ action: 'NONE' });
  });
});

describe('늦은 투표 차단', () => {
  it('버전이 다르면 STALE로 본다', () => {
    expect(isStaleVote(1, 2)).toBe(true);
    expect(isStaleVote(2, 2)).toBe(false);
  });
});

describe('전원 투표 완료 판정', () => {
  const eligible = ['u1', 'u2', 'u3'];

  it('모든 대상자가 모든 항목에 투표하면 완료다', () => {
    expect(
      haveAllEligibleVoted(eligible, [
        { voterUserIds: ['u1', 'u2', 'u3'] },
        { voterUserIds: ['u3', 'u1', 'u2'] },
      ]),
    ).toBe(true);
  });

  it('한 항목이라도 한 사람의 표가 없으면 완료가 아니다', () => {
    expect(
      haveAllEligibleVoted(eligible, [
        { voterUserIds: ['u1', 'u2', 'u3'] },
        { voterUserIds: ['u1', 'u2'] },
      ]),
    ).toBe(false);
  });

  it('투표 대상자나 항목이 없으면 조기 확정하지 않는다', () => {
    expect(haveAllEligibleVoted([], [{ voterUserIds: [] }])).toBe(false);
    expect(haveAllEligibleVoted(eligible, [])).toBe(false);
  });
});

describe('자동 확정', () => {
  it('종료 전에는 확정하지 않는다', () => {
    const decision = decideFinalize({
      course,
      now: at('2026-08-15T19:59:59Z'),
      hasPendingRegeneration: false,
      pendingStartedAt: null,
    });
    expect(decision.action).toBe('NOT_YET');
  });

  it('종료 후 진행 중 작업이 없으면 즉시 확정한다', () => {
    const decision = decideFinalize({
      course,
      now: at('2026-08-15T20:00:00Z'),
      hasPendingRegeneration: false,
      pendingStartedAt: null,
    });
    expect(decision.action).toBe('FINALIZE');
  });

  it('재생성 진행 중이면 유예시간만 기다린다', () => {
    const pendingStartedAt = at('2026-08-15T19:59:55Z');
    expect(
      decideFinalize({ course, now: at('2026-08-15T20:00:05Z'), hasPendingRegeneration: true, pendingStartedAt })
        .action,
    ).toBe('WAIT');
    expect(
      decideFinalize({ course, now: at('2026-08-15T20:00:25Z'), hasPendingRegeneration: true, pendingStartedAt })
        .action,
    ).toBe('FINALIZE');
  });
});

describe('카운트다운 표기', () => {
  it('mm:ss로 표기한다', () => {
    expect(formatCountdown(3600)).toBe('60:00');
    expect(formatCountdown(404)).toBe('06:44');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});
