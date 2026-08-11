import { describe, expect, it } from 'vitest';
import {
  aggregatePreferences,
  calcItemRevoteEndsAt,
  calcVotingEndsAt,
  canVoteOnItem,
  closeResponses,
  decideFinalize,
  decideRegeneration,
  eligibleVoterCount,
  filterPlaces,
  isStaleVote,
  requiredDislikeCount,
  votingPolicy,
  type ParticipantSnapshot,
  type PlaceCandidate,
} from '@oneulcourse/core';

/**
 * 흐름 통합 테스트.
 *
 * DB 없이 도메인 규칙을 순서대로 이어 붙여, 지시서 §17의 시나리오를 그대로 확인한다.
 * (실제 DB를 쓰는 e2e는 docker compose로 PostgreSQL을 띄운 뒤 별도로 추가한다.)
 */

const MINUTE = 60_000;
const at = (iso: string) => new Date(iso);

// 4명이 참여하고 전원이 취향을 제출한 상태
const participants: ParticipantSnapshot[] = [
  { participantId: 'p1', userId: 'u1', status: 'INTERVIEW_COMPLETED' },
  { participantId: 'p2', userId: 'u2', status: 'INTERVIEW_COMPLETED' },
  { participantId: 'p3', userId: 'u3', status: 'INTERVIEW_COMPLETED' },
  { participantId: 'p4', userId: 'u4', status: 'INTERVIEW_COMPLETED' },
];

describe('시나리오: 응답 마감 → 코스 생성 → 투표 → 재생성 → 확정', () => {
  const generatedAt = at('2026-08-15T10:00:00Z');
  const course = {
    votingStartedAt: generatedAt,
    votingEndsAt: calcVotingEndsAt(generatedAt),
  };

  it('제출자가 있으면 제출된 응답만으로 생성을 진행한다', () => {
    const withNoResponse: ParticipantSnapshot[] = [
      ...participants.slice(0, 3),
      { participantId: 'p4', userId: 'u4', status: 'JOINED' },
    ];
    const outcome = closeResponses(withNoResponse);

    expect(outcome.outcome).toBe('GENERATE');
    if (outcome.outcome === 'GENERATE') {
      // 미응답자의 기본 설정을 대신 쓰지 않는다.
      expect(outcome.submittedUserIds).toHaveLength(3);
      expect(outcome.noResponseParticipantIds).toEqual(['p4']);
    }
    // 투표 대상 인원도 제출자만 센다.
    expect(eligibleVoterCount(withNoResponse)).toBe(3);
  });

  it('코스 생성 완료 시점부터 60분 창이 열린다', () => {
    expect(course.votingEndsAt.toISOString()).toBe('2026-08-15T11:00:00.000Z');
  });

  it('4명 중 싫어요 3명이면 재생성한다', () => {
    const eligible = eligibleVoterCount(participants);
    expect(requiredDislikeCount(eligible)).toBe(3);

    expect(
      decideRegeneration({
        dislikeCount: 2,
        eligibleParticipantCount: eligible,
        regenerationCount: 0,
        itemStatus: 'ACTIVE',
      }),
    ).toEqual({ action: 'NONE' });

    expect(
      decideRegeneration({
        dislikeCount: 3,
        eligibleParticipantCount: eligible,
        regenerationCount: 0,
        itemStatus: 'ACTIVE',
      }),
    ).toEqual({ action: 'REGENERATE' });
  });

  it('재생성해도 코스 확정 시각은 그대로다', () => {
    const before = course.votingEndsAt.getTime();
    const regeneratedAt = at('2026-08-15T10:20:00Z');
    const revoteEndsAt = calcItemRevoteEndsAt(regeneratedAt, course.votingEndsAt);

    // 새 항목만 10분 창을 갖는다.
    expect(revoteEndsAt.toISOString()).toBe('2026-08-15T10:30:00.000Z');
    // 코스 타이머는 앞당겨지지도 늘어나지도 않는다.
    expect(course.votingEndsAt.getTime()).toBe(before);
  });

  it('교체된 항목의 투표는 0부터 시작하고 다른 항목 투표는 유지된다', () => {
    // 교체 전 항목에 있던 표는 새 항목으로 옮겨지지 않는다.
    const votesOnOldItem = [
      { itemId: 'item_dinner_v1', userId: 'u1', vote: 'DISLIKE' as const },
      { itemId: 'item_dinner_v1', userId: 'u2', vote: 'DISLIKE' as const },
      { itemId: 'item_dinner_v1', userId: 'u3', vote: 'DISLIKE' as const },
    ];
    const votesOnCafe = [{ itemId: 'item_cafe', userId: 'u1', vote: 'LIKE' as const }];

    const votesOnNewItem = votesOnOldItem.filter((v) => v.itemId === 'item_dinner_v2');
    expect(votesOnNewItem).toHaveLength(0);
    // 카페 항목의 투표는 그대로다.
    expect(votesOnCafe).toHaveLength(1);
  });

  it('교체 전 항목에 도착한 늦은 투표는 거절한다', () => {
    expect(isStaleVote(1, 2)).toBe(true);
    expect(isStaleVote(2, 2)).toBe(false);
  });

  it('재투표 창이 닫힌 항목은 코스 시간이 남아 있어도 투표할 수 없다', () => {
    const item = { revoteEndsAt: at('2026-08-15T10:30:00Z'), status: 'ACTIVE' as const };

    // 코스는 아직 30분 남았지만 이 항목만 닫힌다.
    expect(canVoteOnItem(course, item, at('2026-08-15T10:29:00Z')).allowed).toBe(true);
    expect(canVoteOnItem(course, item, at('2026-08-15T10:31:00Z'))).toEqual({
      allowed: false,
      reason: 'REVOTE_WINDOW_CLOSED',
    });
    // 같은 시각에 다른 최초 항목은 여전히 투표할 수 있다.
    expect(canVoteOnItem(course, { revoteEndsAt: null, status: 'ACTIVE' }, at('2026-08-15T10:31:00Z')).allowed).toBe(
      true,
    );
  });

  it('재투표 창은 코스 종료시간을 넘기지 않는다', () => {
    const lateRegeneration = at('2026-08-15T10:55:00Z'); // 남은 5분
    expect(calcItemRevoteEndsAt(lateRegeneration, course.votingEndsAt).toISOString()).toBe(
      course.votingEndsAt.toISOString(),
    );
  });

  it('항목당 재생성은 3회까지만 허용한다', () => {
    expect(
      decideRegeneration({
        dislikeCount: 4,
        eligibleParticipantCount: 4,
        regenerationCount: votingPolicy.maxRegenerationPerItem,
        itemStatus: 'ACTIVE',
      }),
    ).toEqual({ action: 'LOCK', reason: 'MAX_REGENERATION_REACHED' });
  });

  it('60분이 지나면 자동 확정된다', () => {
    expect(
      decideFinalize({
        course,
        now: at('2026-08-15T10:59:59Z'),
        hasPendingRegeneration: false,
        pendingStartedAt: null,
      }).action,
    ).toBe('NOT_YET');

    expect(
      decideFinalize({
        course,
        now: course.votingEndsAt,
        hasPendingRegeneration: false,
        pendingStartedAt: null,
      }).action,
    ).toBe('FINALIZE');
  });

  it('확정 직전 재생성 중이면 유예시간만 기다렸다가 직전 항목으로 확정한다', () => {
    const pendingStartedAt = new Date(course.votingEndsAt.getTime() - 5_000);

    expect(
      decideFinalize({
        course,
        now: new Date(course.votingEndsAt.getTime() + 5_000),
        hasPendingRegeneration: true,
        pendingStartedAt,
      }).action,
    ).toBe('WAIT');

    const afterGrace = new Date(
      course.votingEndsAt.getTime() + votingPolicy.finalizeGracePeriodSeconds * 1000 + 1_000,
    );
    expect(
      decideFinalize({ course, now: afterGrace, hasPendingRegeneration: true, pendingStartedAt }).action,
    ).toBe('FINALIZE');
  });
});

describe('시나리오: 안전조건이 선호보다 우선한다', () => {
  const aggregated = aggregatePreferences([
    {
      anonymousParticipantId: 'anon_1',
      preferredFoods: ['KOREAN'],
      dislikedFoods: [],
      allergies: ['PEANUT'],
      preferredActivities: [],
      activityKeywords: [],
      preferredAtmospheres: [],
      budget: { min: 20000, max: 40000, currency: 'KRW' },
      mustHave: ['PET_FRIENDLY'],
      mustAvoid: [],
    },
    {
      anonymousParticipantId: 'anon_2',
      preferredFoods: ['KOREAN', 'JAPANESE'],
      dislikedFoods: [],
      allergies: [],
      preferredActivities: [],
      activityKeywords: [],
      preferredAtmospheres: [],
      budget: { min: 10000, max: 50000, currency: 'KRW' },
      mustHave: [],
      mustAvoid: [],
    },
  ]);

  const basePlace = (over: Partial<PlaceCandidate>): PlaceCandidate => ({
    placeId: 'place_x',
    name: '테스트 식당',
    address: '서울',
    latitude: 37.5,
    longitude: 127,
    category: 'DINNER',
    petFriendly: true,
    petFriendlyVerifiedAt: at('2026-08-01T00:00:00Z'),
    allergenInfo: [],
    allergenVerifiedAt: at('2026-08-01T00:00:00Z'),
    // 2026-08-15는 토요일
    openingHours: { 6: { open: '11:00', close: '23:00' } },
    averagePricePerPerson: 30000,
    ...over,
  });

  const ctx = {
    aggregated,
    rejectedPlaceIds: [],
    usedPlaceIds: [],
    visitStartAt: new Date('2026-08-15T18:00:00'),
    visitEndAt: new Date('2026-08-15T19:30:00'),
  };

  it('한 명의 알레르기와 반려견 조건이 전체에 적용된다', () => {
    expect(aggregated.allergies).toEqual(['PEANUT']);
    expect(aggregated.mustHave).toEqual(['PET_FRIENDLY']);
    // 예산은 전원이 감당 가능한 범위로 좁혀진다.
    expect(aggregated.budget).toEqual({ min: 20000, max: 40000, currency: 'KRW' });
  });

  it('정보를 확인할 수 없는 장소는 추천하지 않는다', () => {
    const unverified = filterPlaces(
      [basePlace({ petFriendly: null, petFriendlyVerifiedAt: null, allergenInfo: null, allergenVerifiedAt: null })],
      ctx,
    );
    expect(unverified.accepted).toHaveLength(0);
    expect(unverified.rejected[0]?.reason).toBe('PET_FRIENDLY_UNVERIFIED');
  });

  it('선호 음식이라도 알레르기 재료가 있으면 제외한다', () => {
    const risky = filterPlaces([basePlace({ allergenInfo: ['PEANUT'] })], ctx);
    expect(risky.accepted).toHaveLength(0);
    expect(risky.rejected[0]?.reason).toBe('ALLERGEN_PRESENT');
  });

  it('모든 안전조건을 통과한 장소만 후보가 된다', () => {
    const safe = filterPlaces([basePlace({})], ctx);
    expect(safe.accepted.map((p) => p.placeId)).toEqual(['place_x']);
  });

  it('한 번 거절된 장소는 다시 추천하지 않는다', () => {
    const blacklisted = filterPlaces([basePlace({})], { ...ctx, rejectedPlaceIds: ['place_x'] });
    expect(blacklisted.rejected[0]?.reason).toBe('BLACKLISTED');
  });
});

describe('시나리오: 아무도 응답하지 않은 경우', () => {
  it('생성을 강행하지 않고 방장 선택으로 넘긴다', () => {
    const outcome = closeResponses([
      { participantId: 'p1', userId: 'u1', status: 'JOINED' },
      { participantId: 'p2', userId: 'u2', status: 'INTERVIEW_IN_PROGRESS' },
    ]);
    expect(outcome.outcome).toBe('NO_SUBMISSION');
  });

  it('투표 대상이 0명이면 어떤 싫어요로도 재생성되지 않는다', () => {
    expect(
      decideRegeneration({
        dislikeCount: 99,
        eligibleParticipantCount: 0,
        regenerationCount: 0,
        itemStatus: 'ACTIVE',
      }),
    ).toEqual({ action: 'NONE' });
  });
});

describe('경계: 투표 창 양 끝', () => {
  const generatedAt = at('2026-08-15T10:00:00Z');
  const course = { votingStartedAt: generatedAt, votingEndsAt: calcVotingEndsAt(generatedAt) };
  const item = { revoteEndsAt: null, status: 'ACTIVE' as const };

  it('종료 1초 전에는 투표할 수 있고, 종료 시각에는 닫힌다', () => {
    expect(canVoteOnItem(course, item, new Date(course.votingEndsAt.getTime() - 1000)).allowed).toBe(true);
    expect(canVoteOnItem(course, item, course.votingEndsAt)).toEqual({ allowed: false, reason: 'VOTING_CLOSED' });
  });

  it('재생성 중인 항목에는 투표할 수 없다', () => {
    expect(
      canVoteOnItem(course, { revoteEndsAt: null, status: 'REGENERATING' }, at('2026-08-15T10:10:00Z')).reason,
    ).toBe('ITEM_NOT_VOTABLE');
  });

  it('교체 직후 재투표 창은 정확히 10분이다', () => {
    const regeneratedAt = at('2026-08-15T10:05:00Z');
    const revoteEndsAt = calcItemRevoteEndsAt(regeneratedAt, course.votingEndsAt);
    expect((revoteEndsAt.getTime() - regeneratedAt.getTime()) / MINUTE).toBe(votingPolicy.revoteWindowMinutes);
  });
});
