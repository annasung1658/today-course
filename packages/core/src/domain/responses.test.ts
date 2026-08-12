import { describe, expect, it } from 'vitest';
import {
  aggregatePreferences,
  closeResponses,
  defaultResponseDeadline,
  eligibleVoterCount,
  reminderTimes,
  type ExtractedPreference,
  type ParticipantSnapshot,
} from './responses';
import {
  filterPlaces,
  validateFixedSchedulesPreserved,
  validateItemTimeline,
  buildRegenerationConstraints,
  filterByProximity,
  haversineKm,
} from './course';
import type { PlaceCandidate } from './course';

const participant = (id: string, status: ParticipantSnapshot['status']): ParticipantSnapshot => ({
  participantId: `ptc_${id}`,
  userId: `usr_${id}`,
  status,
});

describe('응답 마감', () => {
  it('기본 마감은 생성 5시간 뒤다', () => {
    const created = new Date('2026-08-10T18:00:00Z');
    expect(defaultResponseDeadline(created).toISOString()).toBe('2026-08-10T23:00:00.000Z');
  });

  it('마감 1시간 전과 10분 전에 리마인더를 보낸다', () => {
    const deadline = new Date('2026-08-10T23:00:00Z');
    expect(reminderTimes(deadline).map((d) => d.toISOString())).toEqual([
      '2026-08-10T22:00:00.000Z',
      '2026-08-10T22:50:00.000Z',
    ]);
  });

  it('제출자가 있으면 제출된 응답만으로 생성한다', () => {
    const result = closeResponses([
      participant('1', 'INTERVIEW_COMPLETED'),
      participant('2', 'INTERVIEW_COMPLETED'),
      participant('3', 'INTERVIEW_IN_PROGRESS'),
      participant('4', 'DECLINED'),
    ]);
    expect(result.outcome).toBe('GENERATE');
    if (result.outcome === 'GENERATE') {
      expect(result.submittedUserIds).toEqual(['usr_1', 'usr_2']);
      expect(result.noResponseParticipantIds).toEqual(['ptc_3']);
    }
  });

  it('아무도 제출하지 않으면 방장 선택으로 넘긴다', () => {
    const result = closeResponses([participant('1', 'JOINED'), participant('2', 'INVITED')]);
    expect(result.outcome).toBe('NO_SUBMISSION');
  });

  it('투표 대상은 제출자만 센다', () => {
    expect(
      eligibleVoterCount([
        participant('1', 'INTERVIEW_COMPLETED'),
        participant('2', 'INTERVIEW_COMPLETED'),
        participant('3', 'NO_RESPONSE'),
        participant('4', 'DECLINED'),
      ]),
    ).toBe(2);
  });
});

describe('취향 집계', () => {
  const make = (id: string, over: Partial<ExtractedPreference>): ExtractedPreference => ({
    anonymousParticipantId: id,
    preferredFoods: [],
    dislikedFoods: [],
    allergies: [],
    preferredActivities: [],
    activityKeywords: [],
    preferredAtmospheres: [],
    budget: null,
    mustHave: [],
    mustAvoid: [],
    ...over,
  });

  it('한 명의 알레르기도 전체 조건이 된다', () => {
    const result = aggregatePreferences([
      make('anon_1', { allergies: ['PEANUT'] }),
      make('anon_2', { preferredFoods: ['JAPANESE'] }),
    ]);
    expect(result.allergies).toEqual(['PEANUT']);
  });

  it('한 명이 애견동반을 걸면 전체 필수조건이 된다', () => {
    const result = aggregatePreferences([
      make('anon_1', { mustHave: ['PET_FRIENDLY'] }),
      make('anon_2', {}),
      make('anon_3', {}),
    ]);
    expect(result.mustHave).toEqual(['PET_FRIENDLY']);
  });

  it('한 명이라도 싫어하는 음식은 회피 대상이다', () => {
    const result = aggregatePreferences([
      make('anon_1', { preferredFoods: ['WESTERN'] }),
      make('anon_2', { dislikedFoods: ['WESTERN'] }),
    ]);
    expect(result.dislikedFoods).toEqual(['WESTERN']);
  });

  it('선호 음식은 언급 횟수 순으로 정렬한다', () => {
    const result = aggregatePreferences([
      make('anon_1', { preferredFoods: ['JAPANESE', 'KOREAN'] }),
      make('anon_2', { preferredFoods: ['JAPANESE'] }),
    ]);
    expect(result.preferredFoods[0]).toEqual({ tag: 'JAPANESE', count: 2 });
  });

  it('예산은 전원이 감당 가능한 범위로 좁힌다', () => {
    const result = aggregatePreferences([
      make('anon_1', { budget: { min: 20000, max: 40000, currency: 'KRW' } }),
      make('anon_2', { budget: { min: 30000, max: 50000, currency: 'KRW' } }),
    ]);
    expect(result.budget).toEqual({ min: 30000, max: 40000, currency: 'KRW' });
  });
});

describe('장소 필터', () => {
  const baseAggregated = aggregatePreferences([
    {
      anonymousParticipantId: 'anon_1',
      preferredFoods: [],
      dislikedFoods: [],
      allergies: ['PEANUT'],
      preferredActivities: [],
      activityKeywords: [],
      preferredAtmospheres: [],
      budget: { min: 10000, max: 30000, currency: 'KRW' },
      mustHave: ['PET_FRIENDLY'],
      mustAvoid: [],
    },
  ]);

  const place = (over: Partial<PlaceCandidate>): PlaceCandidate => ({
    placeId: 'place_1',
    name: '테스트 장소',
    address: '서울',
    latitude: 37.5,
    longitude: 127.0,
    category: 'DINNER',
    petFriendly: true,
    petFriendlyVerifiedAt: new Date('2026-08-01T00:00:00Z'),
    allergenInfo: [],
    allergenVerifiedAt: new Date('2026-08-01T00:00:00Z'),
    openingHours: { 6: { open: '11:00', close: '22:00' } },
    averagePricePerPerson: 20000,
    ...over,
  });

  // 2026-08-15는 토요일(getDay() === 6)
  const ctx = {
    aggregated: baseAggregated,
    rejectedPlaceIds: ['place_black'],
    usedPlaceIds: ['place_used'],
    visitStartAt: new Date('2026-08-15T18:00:00'),
    visitEndAt: new Date('2026-08-15T19:30:00'),
  };

  it('애견동반 정보가 없는 장소는 제외한다', () => {
    const result = filterPlaces([place({ petFriendly: null, petFriendlyVerifiedAt: null })], ctx);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('PET_FRIENDLY_UNVERIFIED');
  });

  it('알레르기 정보를 확인할 수 없는 식당은 제외한다', () => {
    const result = filterPlaces([place({ allergenInfo: null, allergenVerifiedAt: null })], ctx);
    expect(result.rejected[0]?.reason).toBe('ALLERGEN_UNVERIFIED');
  });

  it('알레르기 유발 재료가 있으면 제외한다', () => {
    const result = filterPlaces([place({ allergenInfo: ['PEANUT'] })], ctx);
    expect(result.rejected[0]?.reason).toBe('ALLERGEN_PRESENT');
  });

  it('블랙리스트 장소는 다시 추천하지 않는다', () => {
    const result = filterPlaces([place({ placeId: 'place_black' })], ctx);
    expect(result.rejected[0]?.reason).toBe('BLACKLISTED');
  });

  it('같은 코스 안에서 장소를 중복 추천하지 않는다', () => {
    const result = filterPlaces([place({ placeId: 'place_used' })], ctx);
    expect(result.rejected[0]?.reason).toBe('DUPLICATE_IN_COURSE');
  });

  it('방문 시간에 영업하지 않으면 제외한다', () => {
    const result = filterPlaces([place({ openingHours: { 6: { open: '11:00', close: '17:00' } } })], ctx);
    expect(result.rejected[0]?.reason).toBe('CLOSED_AT_VISIT_TIME');
  });

  it('모든 조건을 통과하면 추천 후보가 된다', () => {
    const result = filterPlaces([place({})], ctx);
    expect(result.accepted).toHaveLength(1);
  });
});

describe('픽스 일정 보존', () => {
  const fixed = {
    id: 'fix_1',
    startAt: new Date('2026-08-15T19:00:00Z'),
    endAt: new Date('2026-08-15T21:00:00Z'),
    placeName: 'CGV 왕십리',
    category: 'ACTIVITY' as const,
  };

  it('픽스 일정을 삭제하면 검증에 실패한다', () => {
    const result = validateFixedSchedulesPreserved([], [fixed]);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('누락');
  });

  it('픽스 일정 시간을 바꾸면 검증에 실패한다', () => {
    const result = validateFixedSchedulesPreserved(
      [
        {
          sequence: 1,
          category: 'ACTIVITY',
          startAt: new Date('2026-08-15T20:00:00Z'),
          endAt: new Date('2026-08-15T22:00:00Z'),
          placeId: null,
          fixedScheduleId: 'fix_1',
        },
      ],
      [fixed],
    );
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('시간 변경');
  });

  it('픽스 일정 카테고리를 바꾸면 검증에 실패한다', () => {
    const result = validateFixedSchedulesPreserved(
      [
        {
          sequence: 1,
          category: 'DINNER',
          startAt: fixed.startAt,
          endAt: fixed.endAt,
          placeId: null,
          fixedScheduleId: 'fix_1',
        },
      ],
      [fixed],
    );
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('카테고리 변경');
  });

  it('그대로 유지하면 통과한다', () => {
    const result = validateFixedSchedulesPreserved(
      [
        {
          sequence: 1,
          category: 'ACTIVITY',
          startAt: fixed.startAt,
          endAt: fixed.endAt,
          placeId: null,
          fixedScheduleId: 'fix_1',
        },
      ],
      [fixed],
    );
    expect(result.valid).toBe(true);
  });
});

describe('코스 타임라인 검증', () => {
  const item = (sequence: number, start: string, end: string) => ({
    sequence,
    category: 'CAFE' as const,
    startAt: new Date(start),
    endAt: new Date(end),
    placeId: `place_${sequence}`,
    fixedScheduleId: null,
  });

  it('항목 시간이 겹치면 실패한다', () => {
    const result = validateItemTimeline([
      item(1, '2026-08-15T17:00:00Z', '2026-08-15T18:30:00Z'),
      item(2, '2026-08-15T18:00:00Z', '2026-08-15T19:00:00Z'),
    ]);
    expect(result.valid).toBe(false);
  });

  it('순차적이면 통과한다', () => {
    const result = validateItemTimeline([
      item(1, '2026-08-15T17:00:00Z', '2026-08-15T18:00:00Z'),
      item(2, '2026-08-15T18:00:00Z', '2026-08-15T19:00:00Z'),
    ]);
    expect(result.valid).toBe(true);
  });
});

describe('부분 재생성 제약', () => {
  const items = [
    { sequence: 1, category: 'CAFE' as const, startAt: new Date('2026-08-15T17:00:00Z'), endAt: new Date('2026-08-15T18:00:00Z'), placeId: 'p1', fixedScheduleId: null },
    { sequence: 2, category: 'DINNER' as const, startAt: new Date('2026-08-15T18:00:00Z'), endAt: new Date('2026-08-15T19:30:00Z'), placeId: 'p2', fixedScheduleId: null },
    { sequence: 3, category: 'WALK' as const, startAt: new Date('2026-08-15T19:30:00Z'), endAt: new Date('2026-08-15T20:30:00Z'), placeId: 'p3', fixedScheduleId: null },
  ];

  it('카테고리와 시간대를 유지하고 나머지 장소를 잠근다', () => {
    const c = buildRegenerationConstraints(items, 2);
    expect(c?.category).toBe('DINNER');
    expect(c?.startAt.toISOString()).toBe('2026-08-15T18:00:00.000Z');
    expect(c?.previousPlaceId).toBe('p1');
    expect(c?.nextPlaceId).toBe('p3');
    expect(c?.lockedPlaceIds).toEqual(['p1', 'p3']);
  });
});

describe('장소 근접 필터', () => {
  // 성수동 근처 좌표들
  const seongsu1 = { latitude: 37.5445, longitude: 127.0557 };
  const seongsu2 = { latitude: 37.5421, longitude: 127.0554 };
  // 강남역 근처(성수동에서 직선거리로 약 8km 이상 떨어져 있음)
  const gangnam = { latitude: 37.4979, longitude: 127.0276 };

  it('무게중심에서 반경 밖의 후보는 걸러낸다', () => {
    const candidates = [
      { placeId: 'near', ...seongsu2 },
      { placeId: 'far', ...gangnam },
    ];
    const result = filterByProximity(candidates, [seongsu1], 2.5);
    expect(result.map((c) => c.placeId)).toEqual(['near']);
  });

  it('필터링하면 후보가 하나도 안 남으면 원본을 그대로 돌려준다', () => {
    const candidates = [{ placeId: 'far', ...gangnam }];
    const result = filterByProximity(candidates, [seongsu1], 2.5);
    expect(result).toEqual(candidates);
  });

  it('기준점이 없으면 원본을 그대로 돌려준다', () => {
    const candidates = [{ placeId: 'a', ...seongsu1 }];
    expect(filterByProximity(candidates, [], 2.5)).toEqual(candidates);
  });

  it('같은 좌표끼리는 거리가 0이다', () => {
    expect(haversineKm(seongsu1, seongsu1)).toBe(0);
  });
});
