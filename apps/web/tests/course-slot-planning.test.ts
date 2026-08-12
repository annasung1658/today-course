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
});
