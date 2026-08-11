import {
  filterPlaces,
  koreaTimeParts,
} from '@oneulcourse/core';
import type { CourseItemCategory, PlaceCandidate } from '@oneulcourse/core';
import type {
  AiProvider,
  CourseGenerationInput,
  GeneratedCourse,
  GeneratedCourseItem,
  ItemRegenerationInput,
  PreferenceExtractionOutput,
} from '@/providers/types';
import { categoryLabel } from '../mock/ai';
import { MockPlaceProvider, MockRouteProvider } from '../mock/place';

/**
 * Gemini 3.5 Flash-Lite 기반 실제 AI Provider.
 * 인터뷰 질문·취향 추출·장소 선택·문구 생성은 Gemini가 맡고,
 * 알레르기·예산·영업시간 같은 안전조건 필터링(filterPlaces)과 이동시간 계산은
 * 그대로 코드가 담당한다 — 이 부분까지 LLM에 맡기면 잘못된 장소를 추천할 위험이 있다.
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_REQUEST_TIMEOUT_MS = 15_000;

const ACTIVITY_ENUM = ['WALK', 'EXHIBITION', 'SHOPPING', 'ACTIVITY', 'BAR', 'CAFE'];
const ATMOSPHERE_ENUM = ['QUIET', 'CASUAL', 'TRENDY', 'SPECIAL'];
const ALLERGY_ENUM = ['PEANUT', 'SHELLFISH', 'DAIRY', 'GLUTEN', 'EGG', 'TREE_NUT', 'SEAFOOD'];
const MUST_HAVE_ENUM = ['PET_FRIENDLY', 'STEP_FREE'];
const MUST_AVOID_ENUM = ['LONG_WAIT', 'CROWDED', 'SPICY'];

async function callGemini<T>(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  responseSchema: object;
}): Promise<T> {
  const res = await fetch(`${GEMINI_ENDPOINT}/${params.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': params.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: params.responseSchema },
    }),
    signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Gemini API 오류 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답에 콘텐츠가 없습니다.');
  return JSON.parse(text) as T;
}

export class GeminiAiProvider implements AiProvider {
  readonly name = 'gemini';
  private places = new MockPlaceProvider();
  private routes = new MockRouteProvider();

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  private call<T>(systemInstruction: string, prompt: string, responseSchema: object): Promise<T> {
    return callGemini<T>({ apiKey: this.apiKey, model: this.model, systemInstruction, prompt, responseSchema });
  }

  async extractPreferences(
    history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>,
  ): Promise<PreferenceExtractionOutput> {
    const conversation = history.map((m) => `${m.role === 'USER' ? '참가자' : '진행자'}: ${m.content}`).join('\n');
    return this.call<PreferenceExtractionOutput>(
      '너는 대화 내용에서 모임 참가자의 취향을 구조화된 태그로 뽑아내는 도우미야. ' +
        '대화에 없는 내용은 추측해서 채우지 마. ' +
        '처음에 입력 받은 일정 시작 시간과 종료시간을 준수하여 일정을 짜야해' +
        '종료시간이 오후 8시이면 일정이 끝나는 시간도 오후 8시여야 해' +
        '활동 부분에서 추천하는 활동의 장소는 입력받은 장소를 절대 벗어나면 안돼' +
        '너가 받은 지역이 잠실이면 잠실 동네에 있는 장소를 꼭 추천해야해' +
        '"먹고 싶다"처럼 긍정 표현은 preferredFoods, "싫다/피하고 싶다"처럼 부정 표현은 dislikedFoods로 분류해. ' +
        '같은 문장 안에 긍정과 부정이 같이 있으면 각각 해당하는 대상에만 정확히 적용해.\n\n' +
        'preferredFoods/dislikedFoods는 "한식", "일식" 같은 큰 카테고리로 뭉뚱그리지 말고, ' +
        '"곱창", "파스타", "초밥", "마라탕"처럼 실제로 말한 구체적인 음식·재료 단어를 그대로 뽑아. ' +
        '예를 들어 "곱창이 싫어"는 dislikedFoods에 "곱창"만 넣어야 해 — "한식 전체가 싫다"는 뜻이 아니야.\n\n' +
        '활동 태그(preferredActivities)는 아래 열거값 중에서만 골라야 해. 이 구분에 특히 주의해: ' +
        'CAFE는 커피·디저트를 즐기는 일반적인 카페만 뜻해. ' +
        '"보드게임카페", "방탈출카페", "공방카페", "만화카페"처럼 이름에 "카페"가 들어가도 ' +
        '실제로는 놀거나 체험하는 곳이면 CAFE가 아니라 ACTIVITY로 분류해. ' +
        '글자 그대로 매칭하지 말고 실제로 뭘 하는 곳인지로 판단해.\n\n' +
        'activityKeywords: 참가자가 "체험하고 싶어"처럼 막연하게 말하지 않고 ' +
        '"보드게임카페", "방탈출", "도자기 공방"처럼 구체적인 장소·활동 이름을 직접 말했을 때만, ' +
        '그 구체적인 단어 그대로 넣어. 막연한 표현만 있었다면 빈 배열로 둬 — ' +
        '이건 나중에 장소 검색어로 그대로 쓰이니 없는 걸 지어내면 안 돼.',
        
      `대화 내용:\n${conversation}`,
      {
        type: 'OBJECT',
        properties: {
          preferredFoods: { type: 'ARRAY', items: { type: 'STRING' } },
          dislikedFoods: { type: 'ARRAY', items: { type: 'STRING' } },
          allergies: { type: 'ARRAY', items: { type: 'STRING', enum: ALLERGY_ENUM } },
          preferredActivities: { type: 'ARRAY', items: { type: 'STRING', enum: ACTIVITY_ENUM } },
          activityKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
          preferredAtmospheres: { type: 'ARRAY', items: { type: 'STRING', enum: ATMOSPHERE_ENUM } },
          budget: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              min: { type: 'NUMBER' },
              max: { type: 'NUMBER' },
              currency: { type: 'STRING' },
            },
            required: ['min', 'max', 'currency'],
          },
          mustHave: { type: 'ARRAY', items: { type: 'STRING', enum: MUST_HAVE_ENUM } },
          mustAvoid: { type: 'ARRAY', items: { type: 'STRING', enum: MUST_AVOID_ENUM } },
        },
        required: ['preferredFoods', 'dislikedFoods', 'allergies', 'preferredActivities', 'activityKeywords', 'preferredAtmospheres', 'mustHave', 'mustAvoid'],
      },
    );
  }

  async generateCourse(input: CourseGenerationInput): Promise<GeneratedCourse> {
    // 검증과 재시도는 course-service 한 곳에서만 담당한다.
    // 여기서 다시 반복하면 최대 N²번 Gemini를 호출해 서버리스 제한 시간을 초과한다.
    return this.tryGenerateCourse(input);
  }

  /**
   * 슬롯마다 따로 Gemini를 부르지 않고, 하루 전체 슬롯 + 후보 목록을 한 번에 보여주고
   * 한 번의 호출로 모든 장소를 고르게 한다 — 그래야 "카페 두 곳이 연달아 겹친다" 같은
   * 하루 전체 흐름을 Gemini가 보고 판단할 수 있다. 안전 필터(filterPlaces)는 그대로
   * 슬롯마다 미리 돌려서, Gemini는 이미 안전이 확인된 후보 중에서만 고른다.
   *
   * 영업시간 판정에 필요한 방문 시각은 실제 이동시간을 계산하기 전이라 정확히 알 수 없다.
   * 이동시간을 뺀 순수 체류시간 누적만으로 대략 추정해 필터링하고, 실제 시각·이동시간은
   * Gemini가 고른 뒤에 이어지는 장소들 사이의 진짜 좌표로 다시 계산한다.
   */
  private async tryGenerateCourse(input: CourseGenerationInput): Promise<GeneratedCourse> {
    const plan = planCategories(input);

    let roughCursor = new Date(input.meeting.scheduledStartAt);
    const flexibleSlots: Array<{ index: number; slot: Extract<Slot, { kind: 'PLACE' }>; accepted: PlaceCandidate[] }> = [];
    const resolvedFixed = new Map<number, Extract<Slot, { kind: 'FIXED' }>>();

    plan.forEach((slot, index) => {
      if (slot.kind === 'FIXED') {
        resolvedFixed.set(index, slot);
        roughCursor = new Date(slot.fixed.endAt);
        return;
      }
      const endAt = new Date(roughCursor.getTime() + slot.durationMinutes * 60_000);
      const { accepted } = filterPlaces(
        input.availablePlaces.filter((p) => p.category === slot.category),
        {
          aggregated: input.aggregated,
          rejectedPlaceIds: input.rejectedPlaceIds,
          usedPlaceIds: [],
          visitStartAt: roughCursor,
          visitEndAt: endAt,
        },
      );
      if (accepted.length > 0) flexibleSlots.push({ index, slot, accepted });
      roughCursor = endAt;
    });

    const picks = flexibleSlots.length > 0 ? await this.pickAllPlaces(flexibleSlots, input) : { picks: [], title: '', summary: '' };
    const pickByIndex = new Map(picks.picks.map((p) => [p.slotIndex, p]));

    const items: GeneratedCourseItem[] = [];
    let cursor = new Date(input.meeting.scheduledStartAt);

    for (let index = 0; index < plan.length; index += 1) {
      const fixed = resolvedFixed.get(index);
      if (fixed) {
        items.push({
          sequence: items.length + 1,
          category: 'ACTIVITY',
          title: fixed.fixed.title,
          placeId: null,
          placeName: fixed.fixed.placeName,
          address: null,
          latitude: null,
          longitude: null,
          startAt: fixed.fixed.startAt,
          endAt: fixed.fixed.endAt,
          estimatedPricePerPerson: 0,
          reason: '방장이 미리 정한 일정이라 그대로 넣었어요.',
          travelMinutesFromPrev: items.length === 0 ? 0 : 10,
          fixedScheduleId: fixed.fixed.id,
        });
        cursor = new Date(fixed.fixed.endAt);
        continue;
      }

      const entry = flexibleSlots.find((s) => s.index === index);
      if (!entry) continue;
      const pick = pickByIndex.get(index);
      const place = (pick && entry.accepted.find((p) => p.placeId === pick.placeId)) ?? entry.accepted[0]!;
      const reason = pick?.reason ?? `${input.meeting.areaName}에서 조건에 맞는 곳이에요.`;

      const prev = items[items.length - 1];
      const travel =
        prev && prev.latitude !== null && prev.longitude !== null
          ? await this.routes.estimateMinutes(
              { latitude: prev.latitude, longitude: prev.longitude },
              { latitude: place.latitude, longitude: place.longitude },
            )
          : 0;

      const startAt = new Date(cursor.getTime() + travel * 60_000);
      items.push({
        sequence: items.length + 1,
        category: entry.slot.category,
        title: `${categoryLabel(entry.slot.category)} - ${place.name}`,
        placeId: place.placeId,
        placeName: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        startAt,
        endAt: new Date(startAt.getTime() + entry.slot.durationMinutes * 60_000),
        estimatedPricePerPerson: place.averagePricePerPerson,
        reason,
        travelMinutesFromPrev: travel,
        fixedScheduleId: null,
      });
      cursor = new Date(startAt.getTime() + entry.slot.durationMinutes * 60_000);
    }

    const total = items.reduce((sum, i) => sum + i.estimatedPricePerPerson, 0);
    return {
      title: picks.title || `${input.meeting.areaName} 코스`,
      summary: picks.summary || `${input.meeting.areaName}에서 ${items.length}곳을 도는 코스예요.`,
      estimatedBudgetPerPerson: total,
      items,
    };
  }

  /** 하루 전체 슬롯을 한 번에 보여주고 한 번의 호출로 장소 선택 + 제목/요약까지 받는다. */
  private async pickAllPlaces(
    flexibleSlots: Array<{ index: number; slot: Extract<Slot, { kind: 'PLACE' }>; accepted: PlaceCandidate[] }>,
    input: CourseGenerationInput,
  ): Promise<{ picks: Array<{ slotIndex: number; placeId: string; reason: string }>; title: string; summary: string }> {
    const aggregated = input.aggregated;
    const slotsText = flexibleSlots
      .map(({ index, slot, accepted }) => {
        const candidateList = accepted
          .map((p) => `  - placeId: ${p.placeId}, 이름: ${p.name}, 1인 가격: ${p.averagePricePerPerson}원, 애견동반: ${p.petFriendly ? 'O' : 'X'}`)
          .join('\n');
        return `[슬롯 ${index}] 카테고리: ${categoryLabel(slot.category)}\n후보:\n${candidateList}`;
      })
      .join('\n\n');

    return this.call<{ picks: Array<{ slotIndex: number; placeId: string; reason: string }>; title: string; summary: string }>(
      '너는 모임 코스 하루 전체를 한 번에 설계하는 플래너야. ' +
        '슬롯마다 주어진 후보 목록 중에서만 딱 하나씩 골라야 해(목록에 없는 placeId를 만들면 안 돼). ' +
        '슬롯 순서와 카테고리는 이미 정해져 있으니 바꾸지 마. ' +
        '하루 전체 흐름을 보고 골라 — 예를 들어 비슷한 메뉴·분위기가 연달아 겹치지 않게, ' +
        '비선호 음식과 겹치는 후보는 이름에서 확실히 드러나는 경우 피해줘. ' +
        '참가자가 콕 집어 말한 장소 키워드가 있으면, 후보 이름이 그 키워드와 일치하거나 ' +
        '포함하는 게 있는지 최우선으로 확인하고 있으면 그걸 골라줘. ' +
        '마지막으로 이 코스 전체에 어울리는 제목과 1문장 소개도 한국어로 지어줘.',
      `지역: ${input.meeting.areaName}\n` +
        `분위기 태그: ${input.meeting.atmosphereTags.join(', ') || '없음'}\n` +
        `선호 음식(빈도순): ${aggregated.preferredFoods.map((f) => f.tag).join(', ') || '없음'}\n` +
        `비선호 음식: ${aggregated.dislikedFoods.join(', ') || '없음'}\n` +
        `선호 분위기: ${aggregated.preferredAtmospheres.map((a) => a.tag).join(', ') || '없음'}\n` +
        `참가자가 구체적으로 말한 장소/키워드: ${aggregated.activityKeywords.join(', ') || '없음'}\n` +
        `예산(1인): ${aggregated.budget ? `${aggregated.budget.min}~${aggregated.budget.max}원` : '제한 없음'}\n\n` +
        `${slotsText}`,
      {
        type: 'OBJECT',
        properties: {
          picks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                slotIndex: { type: 'NUMBER' },
                placeId: { type: 'STRING' },
                reason: { type: 'STRING' },
              },
              required: ['slotIndex', 'placeId', 'reason'],
            },
          },
          title: { type: 'STRING' },
          summary: { type: 'STRING' },
        },
        required: ['picks', 'title', 'summary'],
      },
    );
  }

  async regenerateItem(input: ItemRegenerationInput): Promise<GeneratedCourseItem> {
    const candidates = await this.places.search({ area: input.areaName, category: input.target.category, limit: 30 });
    const pool = [...candidates, ...input.availablePlaces].filter((p) => p.category === input.target.category);
    const { accepted } = filterPlaces(pool, {
      aggregated: input.aggregated,
      rejectedPlaceIds: input.rejectedPlaceIds,
      usedPlaceIds: [],
      visitStartAt: input.target.startAt,
      visitEndAt: input.target.endAt,
    });
    if (accepted.length === 0) throw new Error('SAFETY_CONSTRAINT_UNVERIFIED');

    const picked = await this.pickPlace(accepted, input.aggregated, input.areaName, {
      previousPlaceName: input.neighbours.previousPlaceName,
      nextPlaceName: input.neighbours.nextPlaceName,
    });
    if (!picked) throw new Error('SAFETY_CONSTRAINT_UNVERIFIED');

    return {
      sequence: input.target.sequence,
      category: input.target.category,
      title: `${categoryLabel(input.target.category)} - ${picked.place.name}`,
      placeId: picked.place.placeId,
      placeName: picked.place.name,
      address: picked.place.address,
      latitude: picked.place.latitude,
      longitude: picked.place.longitude,
      startAt: input.target.startAt,
      endAt: input.target.endAt,
      estimatedPricePerPerson: picked.place.averagePricePerPerson,
      reason: picked.reason,
      travelMinutesFromPrev: 10,
      fixedScheduleId: null,
    };
  }

  /** filterPlaces를 통과한 안전한 후보 중에서만 Gemini가 고르게 한다 — placeId가 후보 밖이면 안전하게 버린다. */
  private async pickPlace(
    accepted: PlaceCandidate[],
    aggregated: CourseGenerationInput['aggregated'],
    areaName: string,
    neighbours?: { previousPlaceName: string | null; nextPlaceName: string | null },
  ): Promise<{ place: PlaceCandidate; reason: string } | null> {
    if (accepted.length === 0) return null;
    if (accepted.length === 1) return { place: accepted[0]!, reason: `${areaName}에서 조건에 맞는 곳이에요.` };

    const candidateList = accepted
      .map((p) => `- placeId: ${p.placeId}, 이름: ${p.name}, 1인 가격: ${p.averagePricePerPerson}원, 애견동반: ${p.petFriendly ? 'O' : 'X'}`)
      .join('\n');

    const result = await this.call<{ placeId: string; reason: string }>(
      '너는 모임 코스에 들어갈 장소 하나를 후보 목록 중에서 고르는 어드바이저야. ' +
        '반드시 후보 목록에 있는 placeId 중 하나만 골라야 해. 목록에 없는 placeId를 만들어내면 안 돼. ' +
        '비선호 음식은 장소 이름에서 유추할 수 있는 만큼만 판단해서, 확실히 겹치는 후보는 되도록 피해줘 ' +
        '(예: 비선호 음식이 "곱창"이면 이름에 곱창이 들어간 후보는 피하고, 애매하면 무리해서 배제하지 않아도 돼). ' +
        '참가자가 콕 집어 말한 장소 키워드가 있으면, 후보 이름이 그 키워드와 일치하거나 포함하는 게 있는지 최우선으로 확인하고 있으면 그걸 골라줘.',
      `지역: ${areaName}\n` +
        `선호 음식(빈도순): ${aggregated.preferredFoods.map((f) => f.tag).join(', ') || '없음'}\n` +
        `비선호 음식: ${aggregated.dislikedFoods.join(', ') || '없음'}\n` +
        `선호 분위기: ${aggregated.preferredAtmospheres.map((a) => a.tag).join(', ') || '없음'}\n` +
        `참가자가 구체적으로 말한 장소/키워드: ${aggregated.activityKeywords.join(', ') || '없음'}\n` +
        `예산(1인): ${aggregated.budget ? `${aggregated.budget.min}~${aggregated.budget.max}원` : '제한 없음'}\n` +
        (neighbours
          ? `이전 장소: ${neighbours.previousPlaceName ?? '없음'}, 다음 장소: ${neighbours.nextPlaceName ?? '없음'}\n`
          : '') +
        `\n후보 목록:\n${candidateList}\n\n가장 잘 맞는 곳 하나를 고르고, 1문장으로 이유를 한국어로 설명해줘.`,
      {
        type: 'OBJECT',
        properties: { placeId: { type: 'STRING' }, reason: { type: 'STRING' } },
        required: ['placeId', 'reason'],
      },
    );

    const place = accepted.find((p) => p.placeId === result.placeId);
    if (!place) return { place: accepted[0]!, reason: result.reason };
    return { place, reason: result.reason };
  }
}

// ── 내부 헬퍼 (mock/ai.ts의 planCategories와 동일한 규칙) ─────────────

type Slot =
  | { kind: 'PLACE'; category: CourseItemCategory; durationMinutes: number }
  | { kind: 'FIXED'; fixed: CourseGenerationInput['fixedSchedules'][number] };

function planCategories(input: CourseGenerationInput): Slot[] {
  const startHour = koreaTimeParts(input.meeting.scheduledStartAt).hour;
  const activityTags = input.aggregated.preferredActivities.map((a) => a.tag);

  const base: Slot[] = [];
  if (startHour < 15) {
    base.push({ kind: 'PLACE', category: 'LUNCH', durationMinutes: 80 });
    base.push({ kind: 'PLACE', category: 'CAFE', durationMinutes: 60 });
  } else {
    base.push({ kind: 'PLACE', category: 'CAFE', durationMinutes: 60 });
    base.push({ kind: 'PLACE', category: 'DINNER', durationMinutes: 90 });
  }

  let extraAdded = false;
  if (activityTags.includes('EXHIBITION')) {
    base.push({ kind: 'PLACE', category: 'EXHIBITION', durationMinutes: 60 });
    extraAdded = true;
  }
  if (activityTags.includes('SHOPPING')) {
    base.push({ kind: 'PLACE', category: 'SHOPPING', durationMinutes: 50 });
    extraAdded = true;
  }
  if (activityTags.includes('BAR')) {
    base.push({ kind: 'PLACE', category: 'BAR', durationMinutes: 90 });
    extraAdded = true;
  }
  if (activityTags.includes('ACTIVITY')) {
    base.push({ kind: 'PLACE', category: 'ACTIVITY', durationMinutes: 60 });
    extraAdded = true;
  }
  // 위 태그 중 아무것도 안 걸렸으면(예: CAFE만 선호) 최소 코스 개수(aiPolicy.minCourseItems)를
  // 못 채우니 산책을 기본값으로 넣는다.
  if (activityTags.includes('WALK') || !extraAdded) base.push({ kind: 'PLACE', category: 'WALK', durationMinutes: 50 });

  const fixedSlots: Slot[] = input.fixedSchedules.map((fixed) => ({ kind: 'FIXED', fixed }));
  return [...base, ...fixedSlots].sort((a, b) => {
    if (a.kind === 'FIXED' && b.kind === 'FIXED') return a.fixed.startAt.getTime() - b.fixed.startAt.getTime();
    return 0;
  });
}
