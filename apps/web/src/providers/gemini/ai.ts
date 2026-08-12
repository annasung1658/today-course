import {
  courseSlotPolicy,
  filterPlaces,
  koreaTimeParts,
  scaledMaxCourseItems,
} from '@oneulcourse/core';
import type { CourseItemCategory, PlaceCandidate, TimeBand } from '@oneulcourse/core';
import type {
  AiProvider,
  CourseGenerationInput,
  GeneratedCourse,
  GeneratedCourseItem,
  ItemRegenerationInput,
  PreferenceExtractionOutput,
} from '@/providers/types';
import { categoryLabels } from '@/lib/format';
import { LocalRouteProvider } from '../local/place';

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
  private routes = new LocalRouteProvider();

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
      else {
        console.error('[course-generation] slot has zero candidates', {
          category: slot.category,
          totalAvailableForCategory: input.availablePlaces.filter((p) => p.category === slot.category).length,
        });
      }
      roughCursor = endAt;
    });

    const picks = flexibleSlots.length > 0 ? await this.pickAllPlaces(flexibleSlots, input) : { picks: [], title: '', summary: '' };
    const pickByIndex = new Map(picks.picks.map((p) => [p.slotIndex, p]));

    const items: GeneratedCourseItem[] = [];
    let cursor = new Date(input.meeting.scheduledStartAt);

    for (let index = 0; index < plan.length; index += 1) {
      const fixed = resolvedFixed.get(index);
      if (fixed) {
        const prevFixed = items[items.length - 1];
        const fixedTravel =
          prevFixed &&
          prevFixed.latitude !== null &&
          prevFixed.longitude !== null &&
          fixed.fixed.latitude !== null &&
          fixed.fixed.longitude !== null
            ? await this.routes.estimateMinutes(
                { latitude: prevFixed.latitude, longitude: prevFixed.longitude },
                { latitude: fixed.fixed.latitude, longitude: fixed.fixed.longitude },
              )
            : items.length === 0
              ? 0
              : 10;

        items.push({
          sequence: items.length + 1,
          category: fixed.fixed.category,
          title: fixed.fixed.title,
          placeId: fixed.fixed.placeId,
          placeName: fixed.fixed.placeName,
          address: fixed.fixed.address,
          latitude: fixed.fixed.latitude,
          longitude: fixed.fixed.longitude,
          startAt: fixed.fixed.startAt,
          endAt: fixed.fixed.endAt,
          estimatedPricePerPerson: 0,
          reason: '방장이 미리 정한 일정이라 그대로 넣었어요.',
          travelMinutesFromPrev: fixedTravel,
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

      // 이전 항목 이동시간만으로 이어붙이면 밴드 경계를 무시하고 앞당겨질 수 있다
      // (예: 카페 다음 슬롯이 "저녁식사"인데 오후 3시에 붙어버림) — 이 슬롯이 속한
      // 밴드 시작 시각보다 이르게는 잡지 않는다.
      const startAt = new Date(Math.max(cursor.getTime() + travel * 60_000, entry.slot.targetStartAt.getTime()));
      items.push({
        sequence: items.length + 1,
        category: entry.slot.category,
        title: `${categoryLabels[entry.slot.category]} - ${place.name}`,
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
        return `[슬롯 ${index}] 카테고리: ${categoryLabels[slot.category]}\n후보:\n${candidateList}`;
      })
      .join('\n\n');

    return this.call<{ picks: Array<{ slotIndex: number; placeId: string; reason: string }>; title: string; summary: string }>(
      '너는 모임 코스 하루 전체를 한 번에 설계하는 플래너야. ' +
        '전달 받은 일정 시작시간과 끝나는 시간을 꼭 준수해야해. '+
        '전달 받은 위치를 꼭 준수해야해. ' +
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
    const pool = input.availablePlaces.filter((p) => p.category === input.target.category);
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
      title: `${categoryLabels[input.target.category]} - ${picked.place.name}`,
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

export type Slot =
  | { kind: 'PLACE'; category: CourseItemCategory; durationMinutes: number; targetStartAt: Date }
  | { kind: 'FIXED'; fixed: CourseGenerationInput['fixedSchedules'][number] };

/**
 * hour(0~23)가 속한 시간대 밴드를 찾는다. 자정 넘은 시각(0~6시)은 전날 밤 밴드의 연장으로 본다.
 * 어느 밴드에도 안 걸리면(예: 23시~다음날 7시) null을 돌려준다 — 그 시간대는 안전하게
 * 검증된 영업시간 데이터가 없어 새 장소를 추천할 수 없다는 뜻이라, 억지로 아무 밴드에나
 * 끼워 맞추면 안 된다.
 */
function findTimeBand(hour: number): TimeBand | null {
  const normalized = hour < 7 ? hour + 24 : hour;
  return courseSlotPolicy.timeBands.find((b) => normalized >= b.startHour && normalized < b.endHour) ?? null;
}

/**
 * 약속 시작~종료 시각을 시간대 밴드를 따라 훑으면서 슬롯을 짠다.
 * 밴드 폭이 카테고리 체류시간보다 넓으면, 그 밴드 안에서 겹치지 않는 다른 카테고리로
 * 남는 시간을 계속 채운다 — 그렇지 않으면 "전시 1시간만 하고 저녁까지 2시간 붕 뜸"처럼
 * 일정에 설명되지 않는 빈 구간이 생긴다. 밴드의 카테고리를 다 썼거나(같은 밴드에서
 * 카테고리를 반복하지는 않는다) 남은 시간이 부족해지면 밴드 끝 시각으로 커서를 점프해
 * 다음 밴드로 넘어간다.
 *
 * 픽스 일정은 시작 시각에 도달하는 즉시 그 자리에 끼워 넣고, 일반 슬롯은 픽스 일정의
 * 시작 시각을 절대 넘기지 않는다 — 그렇지 않으면 일반 슬롯이 픽스 일정 시간대를 모른 채
 * 배치돼 두 항목의 시간이 겹치는 채로 저장되고, 겹침 검증(validateItemTimeline)에서
 * 매번 재시도만 반복하다 결국 생성이 실패한다(실제로 겪은 버그).
 */
export function planCategories(input: CourseGenerationInput): Slot[] {
  const activityTally = new Map(input.aggregated.preferredActivities.map((a) => [a.tag, a.count]));
  const fixedSorted = [...input.fixedSchedules].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  // 밴드가 픽스 일정에 끊겨도(중간에 다른 걸 끼우고 이어져도) 같은 밴드로 취급해
  // 카테고리를 반복하지 않는다. 밴드 시작 시각(startHour)으로 구분한다.
  const usedByBand = new Map<number, Set<CourseItemCategory>>();

  const base: Slot[] = [];
  let cursor = new Date(input.meeting.scheduledStartAt);
  const end = input.meeting.scheduledEndAt;
  const maxItems = scaledMaxCourseItems((end.getTime() - cursor.getTime()) / 60_000);
  let placeCount = 0;
  let fixedIndex = 0;

  while (cursor.getTime() < end.getTime()) {
    const nextFixed = fixedSorted[fixedIndex];

    if (nextFixed && cursor.getTime() >= nextFixed.startAt.getTime()) {
      base.push({ kind: 'FIXED', fixed: nextFixed });
      cursor = new Date(nextFixed.endAt);
      fixedIndex += 1;
      continue;
    }

    if (placeCount >= maxItems) {
      // 더 넣을 수 있는 일반 슬롯은 없지만, 남은 픽스 일정은 반드시 넣어야 하니
      // 다음 픽스 일정 시작 시각(없으면 종료 시각)까지 커서만 점프시킨다.
      cursor = nextFixed ? new Date(nextFixed.startAt) : new Date(end);
      continue;
    }

    const { hour, minute } = koreaTimeParts(cursor);
    const band = findTimeBand(hour);
    if (!band) {
      // 안전하게 검증된 영업시간 밖(예: 23시~다음날 7시)이라 새로 추천할 수 있는 시간대가
      // 아니다 — 다음 픽스 일정(호스트가 직접 지정한 거라 안전조건과 무관)이나 모임
      // 종료까지 그대로 넘어간다.
      cursor = nextFixed ? new Date(nextFixed.startAt) : new Date(end);
      continue;
    }
    const normalizedHour = hour < 7 ? hour + 24 : hour;
    const bandEndAt = new Date(cursor.getTime() + ((band.endHour - normalizedHour) * 60 - minute) * 60_000);
    // 다음 픽스 일정 시작 전 이동시간 여유(preFixedBufferMinutes)를 뺀, 실제로 항목을
    // 배치해도 되는 절대 한계. 밴드 끝(bandEndAt)은 여기 안 끼운다 — 밴드 끝은 "이 밴드
    // 카테고리로 새 항목을 몇 개 더 시작할지"를 정할 뿐, 이미 고른 항목의 체류시간을
    // 끊는 기준이 아니다. 밴드 끝을 그대로 한계로 쓰면, 밴드 경계에 걸쳐 애매하게 남는
    // 좁은 틈(예: 60분)에 정확히 안 맞는 항목이 통째로 버려지고 그 시간대가 텅 빈다
    // (실제로 겪은 버그 — 픽스 일정 훨씬 전인데 그 직전까지 아무 것도 안 채워짐).
    const fixedBufferedStart = nextFixed
      ? new Date(nextFixed.startAt.getTime() - courseSlotPolicy.preFixedBufferMinutes * 60_000)
      : null;
    const hardLimit =
      fixedBufferedStart && fixedBufferedStart.getTime() < end.getTime() ? fixedBufferedStart : end;

    // "새 항목을 시작할 수 있는" 한계와, 거기서 막히면 커서가 점프할 목적지를 함께 정한다.
    // 셋 중 가장 이른 시각이 이긴다 — 밴드 자연 종료면 다음 밴드로, hardLimit이 모임
    // 종료면 그대로 끝으로, hardLimit이 픽스 버퍼 구간이면 그 여유 구간을 건너뛰고
    // 픽스 일정 시작 시각(버퍼 미적용)으로 바로 점프한다. 버퍼로 깎인 hardLimit을
    // 점프 목적지로 쓰면 다음 루프에서 다시 같은 자리로 계산돼 커서가 멈춰버린다.
    const jumpCandidates: Array<{ limit: Date; jumpTo: Date }> = [
      { limit: bandEndAt, jumpTo: bandEndAt },
      { limit: end, jumpTo: end },
    ];
    if (fixedBufferedStart) jumpCandidates.push({ limit: fixedBufferedStart, jumpTo: nextFixed!.startAt });
    jumpCandidates.sort((a, b) => a.limit.getTime() - b.limit.getTime());
    const bandCutoff = jumpCandidates[0]!.limit;
    const jumpTarget = jumpCandidates[0]!.jumpTo;

    const usedInBand = usedByBand.get(band.startHour) ?? new Set<CourseItemCategory>();
    usedByBand.set(band.startHour, usedInBand);

    while (cursor.getTime() < bandCutoff.getTime() && placeCount < maxItems) {
      // 밴드에 카테고리가 여럿이면 참가자 선호도가 가장 높은 걸 우선하고, 아무도 안
      // 원했으면(전부 0) sort가 안정 정렬이라 밴드에 적힌 순서상 첫 번째가 그대로 남는다.
      const remaining = band.categories
        .filter((c) => !usedInBand.has(c))
        .sort((a, b) => (activityTally.get(b) ?? 0) - (activityTally.get(a) ?? 0));
      if (remaining.length === 0) break;

      // 선호도 1순위가 hardLimit에 안 맞으면 포기하지 않고, 그 안에 들어가는 카테고리가
      // 있는지 순서대로 계속 찾는다 — 짧은 카테고리 하나면 충분히 들어갈 남는 시간을
      // 첫 번째 후보가 안 맞는다는 이유만으로 통째로 날리지 않기 위해서다.
      const chosen = remaining.find(
        (c) => cursor.getTime() + courseSlotPolicy.categoryDurationMinutes[c] * 60_000 <= hardLimit.getTime(),
      );
      if (!chosen) break;

      const durationMinutes = courseSlotPolicy.categoryDurationMinutes[chosen];
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);

      base.push({
        kind: 'PLACE',
        category: chosen,
        durationMinutes,
        // 이 슬롯이 속한 밴드에 들어선 시각 — 실제 시각 배정 때 여기보다 앞당겨지지 않게 한다.
        targetStartAt: new Date(cursor),
      });
      usedInBand.add(chosen);
      placeCount += 1;
      cursor = slotEnd;
    }

    // 더 못 채우고 남은 시간이 있으면(밴드 카테고리 소진, hardLimit 도달 등) 점프
    // 목적지로 커서를 이동한다. 방금 넣은 항목이 이미 bandCutoff를 넘겼다면(밴드 경계를
    // 살짝 넘어 배치됨) 그대로 다음 루프에서 새 밴드/픽스 일정을 다시 판단한다.
    if (cursor.getTime() < bandCutoff.getTime()) cursor = jumpTarget;
  }

  // 위 루프가 모임 종료 시각에서 멈췄더라도, 아직 안 끼운 픽스 일정이 남아있으면 마저 추가한다.
  while (fixedIndex < fixedSorted.length) {
    base.push({ kind: 'FIXED', fixed: fixedSorted[fixedIndex]! });
    fixedIndex += 1;
  }

  return base;
}
