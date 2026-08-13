import { describe, expect, it } from 'vitest';
import { planCategories, type Slot } from '@/providers/gemini/ai';
import type { CourseGenerationInput } from '@/providers/types';

function baseInput(overrides: Partial<CourseGenerationInput>): CourseGenerationInput {
  return {
    meeting: {
      title: '강남영화테스트',
      scheduledStartAt: new Date('2026-08-13T13:00:00+09:00'),
      scheduledEndAt: new Date('2026-08-13T20:30:00+09:00'),
      areaName: '강남',
      relationshipTags: [],
      atmosphereTags: [],
      specialNotes: null,
      participantCount: 2,
    },
    aggregated: {
      preferredFoods: [],
      dislikedFoods: [],
      allergies: [],
      preferredActivities: [],
      activityKeywords: [],
      preferredAtmospheres: [],
      budget: null,
      mustHave: [],
      mustAvoid: [],
      participantCount: 2,
    },
    fixedSchedules: [],
    availablePlaces: [],
    rejectedPlaceIds: [],
    ...overrides,
  };
}

describe('시나리오: 픽스 일정이 모임 시작보다 한참 뒤에 있을 때', () => {
  it('픽스 일정 훨씬 전(밴드 경계에 걸친 좁은 틈)에도 일반 슬롯을 채운다', () => {
    // 실제로 겪은 버그: 13:00 시작, 15:20 CGV(픽스) 사이 2시간 20분이 통째로 빈 채
    // 코스가 CGV부터 시작됐다. 11-14시(LUNCH) 밴드에 진입한 시점(13:00)엔 밴드 안에
    // 60분만 남아 80분짜리 LUNCH가 안 들어갔고, 14-17시 밴드는 픽스 버퍼(45분)를 빼면
    // 겨우 35분만 남아 그 무엇도 안 들어갔다 — 둘 다 개별로는 못 채워도 합치면
    // LUNCH(80분) 하나는 충분히 들어가야 한다.
    const input = baseInput({
      fixedSchedules: [
        {
          id: 'fixed-1',
          title: '스파이더맨 영화',
          startAt: new Date('2026-08-13T15:20:00+09:00'),
          endAt: new Date('2026-08-13T17:40:00+09:00'),
          placeName: 'CGV 강남',
          address: null,
          placeId: null,
          latitude: null,
          longitude: null,
          category: 'ACTIVITY',
        },
      ],
    });

    const plan = planCategories(input);
    const fixedIndex = plan.findIndex((s) => s.kind === 'FIXED');
    expect(fixedIndex).toBeGreaterThan(-1);

    const beforeFixed = plan.slice(0, fixedIndex) as Extract<Slot, { kind: 'PLACE' }>[];
    expect(beforeFixed.length).toBeGreaterThan(0);
    expect(beforeFixed.some((s) => s.category === 'LUNCH')).toBe(true);

    // 픽스 일정 시작 전 이동시간 여유(45분) 안으로는 침범하지 않는다.
    const bufferStart = new Date(input.fixedSchedules[0]!.startAt.getTime() - 45 * 60_000);
    for (const slot of beforeFixed) {
      const slotEnd = slot.targetStartAt.getTime() + slot.durationMinutes * 60_000;
      expect(slotEnd).toBeLessThanOrEqual(bufferStart.getTime());
    }
  });

  it('픽스 일정이 없으면 기존처럼 밴드를 따라 계속 채운다', () => {
    const input = baseInput({});
    const plan = planCategories(input);
    expect(plan.every((s) => s.kind === 'PLACE')).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('밴드 고유 카테고리가 몇 분 차이로 안 맞으면 카페·산책으로 대신 채운다', () => {
    // 실제로 겪은 버그: 12:30 시작, 14:30 CGV(픽스) 사이 2시간이 통째로 빈 채
    // 코스가 CGV부터 시작됐다. 11-14시 밴드는 카테고리가 LUNCH(80분) 하나뿐인데,
    // 픽스 버퍼(45분)를 뺀 한계가 13:45라 12:30+80분=13:50으로 5분 초과해서
    // 대체할 다른 카테고리가 없어 75분(12:30~13:45)을 통째로 포기했다.
    const input = baseInput({
      meeting: {
        ...baseInput({}).meeting,
        scheduledStartAt: new Date('2026-08-13T12:30:00+09:00'),
      },
      fixedSchedules: [
        {
          id: 'fixed-1',
          title: '스파이더맨 영화',
          startAt: new Date('2026-08-13T14:30:00+09:00'),
          endAt: new Date('2026-08-13T16:30:00+09:00'),
          placeName: 'CGV 강남',
          address: null,
          placeId: null,
          latitude: null,
          longitude: null,
          category: 'ACTIVITY',
        },
      ],
    });

    const plan = planCategories(input);
    const fixedIndex = plan.findIndex((s) => s.kind === 'FIXED');
    expect(fixedIndex).toBeGreaterThan(-1);

    const beforeFixed = plan.slice(0, fixedIndex) as Extract<Slot, { kind: 'PLACE' }>[];
    expect(beforeFixed.length).toBeGreaterThan(0);
    expect(beforeFixed.some((s) => s.category === 'CAFE' || s.category === 'WALK')).toBe(true);
  });

  it('픽스 일정이 모임 시작 직후라 버퍼가 모임 시작보다 과거로 계산돼도 멈추지 않는다', () => {
    // 실제로 겪은 버그(운영 DB에서 재현): 모임 시작 10분 뒤에 픽스 일정이 있으면,
    // preFixedBufferMinutes(45분)를 뺀 한계가 모임 시작 시각보다도 더 과거로 계산된다.
    // 그 상태에서 커서(모임 시작)는 그 한계보다 항상 미래라서 "아직 한계 전"이라는
    // 조건이 절대 참이 되지 않아, 안쪽 while도 안 돌고 바깥 점프도 안 일어나 커서가
    // 영원히 멈춘다 — 실제로 이 패턴의 모임 여러 건이 "코스 생성 중" 상태로 하루 넘게
    // 멈춰 있었다. 이 테스트가 멈추지 않고 끝나는 것 자체가 회귀 검증이다.
    const input = baseInput({
      meeting: {
        ...baseInput({}).meeting,
        scheduledStartAt: new Date('2026-08-14T14:00:00+09:00'),
        scheduledEndAt: new Date('2026-08-14T22:30:00+09:00'),
      },
      fixedSchedules: [
        {
          id: 'fixed-1',
          title: '스파이더맨 영화',
          startAt: new Date('2026-08-14T14:10:00+09:00'),
          endAt: new Date('2026-08-14T15:50:00+09:00'),
          placeName: 'CGV 강남',
          address: null,
          placeId: null,
          latitude: null,
          longitude: null,
          category: 'ACTIVITY',
        },
      ],
    });

    const plan = planCategories(input);
    const fixedIndex = plan.findIndex((s) => s.kind === 'FIXED');
    expect(fixedIndex).toBeGreaterThan(-1);
    // 버퍼가 모임 시작 전으로 잡아먹어서, 픽스 일정 전엔 아무 것도 못 들어가는 게 맞다.
    expect(plan.slice(0, fixedIndex).length).toBe(0);
  });
});
