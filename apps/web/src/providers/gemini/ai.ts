import {
  aiPolicy,
  filterPlaces,
  interviewPolicy,
  validateFixedSchedulesPreserved,
  validateItemTimeline,
} from '@oneulcourse/core';
import type { CourseItemCategory, DraftCourseItem, PlaceCandidate } from '@oneulcourse/core';
import type {
  AiProvider,
  CourseGenerationInput,
  GeneratedCourse,
  GeneratedCourseItem,
  InterviewTurnInput,
  InterviewTurnOutput,
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

const FOOD_ENUM = ['JAPANESE', 'KOREAN', 'CHINESE', 'WESTERN', 'SNACK', 'ASIAN'];
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

  async askNextQuestion(input: InterviewTurnInput): Promise<InterviewTurnOutput> {
    const maxQuestions = Math.min(input.targetQuestionCount, interviewPolicy.maxTurns);
    if (input.questionIndex >= maxQuestions) return { nextQuestion: null, isComplete: true };
    if (input.userAnswer.trim().length < 2 && input.questionIndex > 0) {
      return { nextQuestion: '조금만 더 자세히 알려주실 수 있을까요?', isComplete: false };
    }

    const history = input.history.map((m) => `${m.role === 'USER' ? '참가자' : '진행자'}: ${m.content}`).join('\n');
    return this.call<InterviewTurnOutput>(
      '너는 모임 앱 "오늘코스"에서 참가자의 취향을 파악하는 인터뷰 진행자야. ' +
        '음식 취향, 활동/장소, 예산, 알레르기·이동 제약 같은 정보를 자연스러운 한국어 질문으로 물어봐. ' +
        `총 질문은 ${maxQuestions}개를 넘기지 마.`,
      `지금까지 대화:\n${history || '(아직 없음)'}\n\n` +
        `방금 답변: "${input.userAnswer}"\n` +
        `이번이 ${input.questionIndex + 1}번째 질문 차례야. 다음 질문을 만들거나, 이미 충분하면 isComplete를 true로 해줘.`,
      {
        type: 'OBJECT',
        properties: { nextQuestion: { type: 'STRING', nullable: true }, isComplete: { type: 'BOOLEAN' } },
        required: ['isComplete'],
      },
    );
  }

  async extractPreferences(
    history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>,
  ): Promise<PreferenceExtractionOutput> {
    const conversation = history.map((m) => `${m.role === 'USER' ? '참가자' : '진행자'}: ${m.content}`).join('\n');
    return this.call<PreferenceExtractionOutput>(
      '너는 대화 내용에서 모임 참가자의 취향을 구조화된 태그로 뽑아내는 도우미야. ' +
        '반드시 주어진 열거값 안에서만 태그를 골라야 해. 대화에 없는 내용은 추측해서 채우지 마. ' +
        '"먹고 싶다"처럼 긍정 표현은 preferredFoods, "싫다/피하고 싶다"처럼 부정 표현은 dislikedFoods로 분류해. ' +
        '같은 문장 안에 긍정과 부정이 같이 있으면 각각 해당하는 대상에만 정확히 적용해.',
      `대화 내용:\n${conversation}`,
      {
        type: 'OBJECT',
        properties: {
          preferredFoods: { type: 'ARRAY', items: { type: 'STRING', enum: FOOD_ENUM } },
          dislikedFoods: { type: 'ARRAY', items: { type: 'STRING', enum: FOOD_ENUM } },
          allergies: { type: 'ARRAY', items: { type: 'STRING', enum: ALLERGY_ENUM } },
          preferredActivities: { type: 'ARRAY', items: { type: 'STRING', enum: ACTIVITY_ENUM } },
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
        required: ['preferredFoods', 'dislikedFoods', 'allergies', 'preferredActivities', 'preferredAtmospheres', 'mustHave', 'mustAvoid'],
      },
    );
  }

  async generateCourse(input: CourseGenerationInput): Promise<GeneratedCourse> {
    for (let attempt = 0; attempt < aiPolicy.maxValidationRetries; attempt += 1) {
      const course = await this.tryGenerateCourse(input);
      const draftItems: DraftCourseItem[] = course.items.map((item) => ({
        sequence: item.sequence,
        category: item.category,
        startAt: item.startAt,
        endAt: item.endAt,
        placeId: item.placeId,
        fixedScheduleId: item.fixedScheduleId,
      }));
      const fixedCheck = validateFixedSchedulesPreserved(draftItems, input.fixedSchedules);
      const timelineCheck = validateItemTimeline(draftItems);
      if (fixedCheck.valid && timelineCheck.valid) return course;
    }
    throw new Error('Gemini가 생성한 코스가 검증을 통과하지 못했습니다.');
  }

  private async tryGenerateCourse(input: CourseGenerationInput): Promise<GeneratedCourse> {
    const plan = planCategories(input);
    const items: GeneratedCourseItem[] = [];
    const usedPlaceIds: string[] = [];
    let cursor = new Date(input.meeting.scheduledStartAt);

    for (const slot of plan) {
      if (slot.kind === 'FIXED') {
        items.push({
          sequence: items.length + 1,
          category: 'ACTIVITY',
          title: slot.fixed.title,
          placeId: null,
          placeName: slot.fixed.placeName,
          address: null,
          latitude: null,
          longitude: null,
          startAt: slot.fixed.startAt,
          endAt: slot.fixed.endAt,
          estimatedPricePerPerson: 0,
          reason: '방장이 미리 정한 일정이라 그대로 넣었어요.',
          travelMinutesFromPrev: items.length === 0 ? 0 : 10,
          fixedScheduleId: slot.fixed.id,
        });
        cursor = new Date(slot.fixed.endAt);
        continue;
      }

      const endAt = new Date(cursor.getTime() + slot.durationMinutes * 60_000);
      const { accepted } = filterPlaces(
        input.availablePlaces.filter((p) => p.category === slot.category),
        {
          aggregated: input.aggregated,
          rejectedPlaceIds: input.rejectedPlaceIds,
          usedPlaceIds,
          visitStartAt: cursor,
          visitEndAt: endAt,
        },
      );
      if (accepted.length === 0) continue;

      const picked = await this.pickPlace(accepted, input.aggregated, input.meeting.areaName);
      if (!picked) continue;

      const prev = items[items.length - 1];
      const travel =
        prev && prev.latitude !== null && prev.longitude !== null
          ? await this.routes.estimateMinutes(
              { latitude: prev.latitude, longitude: prev.longitude },
              { latitude: picked.place.latitude, longitude: picked.place.longitude },
            )
          : 0;

      const startAt = new Date(cursor.getTime() + travel * 60_000);
      items.push({
        sequence: items.length + 1,
        category: slot.category,
        title: `${categoryLabel(slot.category)} - ${picked.place.name}`,
        placeId: picked.place.placeId,
        placeName: picked.place.name,
        address: picked.place.address,
        latitude: picked.place.latitude,
        longitude: picked.place.longitude,
        startAt,
        endAt: new Date(startAt.getTime() + slot.durationMinutes * 60_000),
        estimatedPricePerPerson: picked.place.averagePricePerPerson,
        reason: picked.reason,
        travelMinutesFromPrev: travel,
        fixedScheduleId: null,
      });
      usedPlaceIds.push(picked.place.placeId);
      cursor = new Date(startAt.getTime() + slot.durationMinutes * 60_000);
    }

    const total = items.reduce((sum, i) => sum + i.estimatedPricePerPerson, 0);
    const copy = await this.call<{ title: string; summary: string }>(
      '너는 모임 코스에 어울리는 제목과 한 줄 소개를 한국어로 짧게 지어주는 카피라이터야.',
      `지역: ${input.meeting.areaName}\n` +
        `분위기 태그: ${input.meeting.atmosphereTags.join(', ') || '없음'}\n` +
        `코스 구성: ${items.map((i) => `${categoryLabel(i.category)}(${i.placeName})`).join(' → ')}\n` +
        `1인 예상 비용: ${total}원`,
      {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, summary: { type: 'STRING' } },
        required: ['title', 'summary'],
      },
    );

    return { title: copy.title, summary: copy.summary, estimatedBudgetPerPerson: total, items };
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
        '반드시 후보 목록에 있는 placeId 중 하나만 골라야 해. 목록에 없는 placeId를 만들어내면 안 돼.',
      `지역: ${areaName}\n` +
        `선호 음식(빈도순): ${aggregated.preferredFoods.map((f) => f.tag).join(', ') || '없음'}\n` +
        `선호 분위기: ${aggregated.preferredAtmospheres.map((a) => a.tag).join(', ') || '없음'}\n` +
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
  const startHour = input.meeting.scheduledStartAt.getHours();
  const activityTags = input.aggregated.preferredActivities.map((a) => a.tag);

  const base: Slot[] = [];
  if (startHour < 15) {
    base.push({ kind: 'PLACE', category: 'LUNCH', durationMinutes: 80 });
    base.push({ kind: 'PLACE', category: 'CAFE', durationMinutes: 60 });
  } else {
    base.push({ kind: 'PLACE', category: 'CAFE', durationMinutes: 60 });
    base.push({ kind: 'PLACE', category: 'DINNER', durationMinutes: 90 });
  }

  if (activityTags.includes('EXHIBITION')) base.push({ kind: 'PLACE', category: 'EXHIBITION', durationMinutes: 60 });
  if (activityTags.includes('WALK') || activityTags.length === 0)
    base.push({ kind: 'PLACE', category: 'WALK', durationMinutes: 50 });
  if (activityTags.includes('SHOPPING')) base.push({ kind: 'PLACE', category: 'SHOPPING', durationMinutes: 50 });
  if (activityTags.includes('BAR')) base.push({ kind: 'PLACE', category: 'BAR', durationMinutes: 90 });

  const fixedSlots: Slot[] = input.fixedSchedules.map((fixed) => ({ kind: 'FIXED', fixed }));
  return [...base, ...fixedSlots].sort((a, b) => {
    if (a.kind === 'FIXED' && b.kind === 'FIXED') return a.fixed.startAt.getTime() - b.fixed.startAt.getTime();
    return 0;
  });
}
