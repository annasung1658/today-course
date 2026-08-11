import { interviewPolicy, filterPlaces } from '@oneulcourse/core';
import type { CourseItemCategory, PlaceCandidate, AggregatedPreference } from '@oneulcourse/core';
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
import { MockPlaceProvider, MockRouteProvider } from './place';

/**
 * OpenAI 키가 없을 때 쓰는 규칙 기반 AI.
 * 실제 Provider와 완전히 같은 인터페이스·출력 스키마를 지키므로
 * 키만 넣으면 그대로 교체된다.
 */

const QUESTIONS = [
  '이번 모임에서 먹고 싶은 음식과 피하고 싶은 음식을 알려주세요.',
  '하고 싶은 활동이나 가고 싶은 장소가 있나요? 반대로 하기 싫은 활동도 좋아요.',
  '1인 기준으로 생각하는 예산은 어느 정도인가요?',
  '알레르기, 반려견 동반, 이동 제약처럼 꼭 지켜야 할 조건이 있다면 알려주세요.',
];

/** 한국어 표현 → 태그 사전. 실제 모델의 Structured Output을 흉내 낸다. */
const FOOD_TAGS: Array<[RegExp, string]> = [
  [/일식|스시|초밥|라멘|사시미/, 'JAPANESE'],
  [/한식|한국\s?음식|국밥|고기|삼겹/, 'KOREAN'],
  [/중식|중국\s?음식|짜장|마라/, 'CHINESE'],
  [/양식|파스타|스테이크|이탈리|피자/, 'WESTERN'],
  [/분식|떡볶이|김밥/, 'SNACK'],
  [/아시안|쌀국수|태국|베트남/, 'ASIAN'],
];

const ACTIVITY_TAGS: Array<[RegExp, string]> = [
  [/산책|걷|공원|숲/, 'WALK'],
  [/전시|미술관|박물관/, 'EXHIBITION'],
  [/쇼핑|편집샵|팝업/, 'SHOPPING'],
  [/체험|공방|원데이|만들/, 'ACTIVITY'],
  [/술|바|와인|맥주|포차/, 'BAR'],
  [/카페|커피|디저트/, 'CAFE'],
];

const ATMOSPHERE_TAGS: Array<[RegExp, string]> = [
  [/조용|한적|차분/, 'QUIET'],
  [/편하|캐주얼|가볍/, 'CASUAL'],
  [/힙|트렌디|감성/, 'TRENDY'],
  [/분위기\s?있|근사|특별/, 'SPECIAL'],
];

const ALLERGY_TAGS: Array<[RegExp, string]> = [
  [/땅콩/, 'PEANUT'],
  [/갑각류|새우|게|조개/, 'SHELLFISH'],
  [/우유|유당/, 'DAIRY'],
  [/밀가루|글루텐/, 'GLUTEN'],
  [/계란|달걀/, 'EGG'],
  [/견과/, 'TREE_NUT'],
];

const NEGATION = /(싫|안 |못 |별로|피하|말고|빼고|제외)/;

function splitClauses(text: string): string[] {
  return text
    .split(/[,.·]|그리고|하지만|근데|그런데|고\s|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchTags(clause: string, dict: Array<[RegExp, string]>): string[] {
  return dict.filter(([re]) => re.test(clause)).map(([, tag]) => tag);
}

/** "일식이 좋아 / 양식은 싫어" 같은 문장을 선호·비선호로 갈라 담는다. */
export function extractFromText(text: string): PreferenceExtractionOutput {
  const preferredFoods = new Set<string>();
  const dislikedFoods = new Set<string>();
  const preferredActivities = new Set<string>();
  const preferredAtmospheres = new Set<string>();
  const allergies = new Set<string>();
  const mustHave = new Set<string>();
  const mustAvoid = new Set<string>();

  for (const clause of splitClauses(text)) {
    const negated = NEGATION.test(clause);

    // 알레르기는 부정 표현과 무관하게 항상 안전조건으로 분리한다.
    for (const tag of matchTags(clause, ALLERGY_TAGS)) {
      if (/알레르기|알러지/.test(clause)) allergies.add(tag);
      else if (negated) dislikedFoods.add(tag === 'SHELLFISH' ? 'SEAFOOD' : tag);
    }

    for (const tag of matchTags(clause, FOOD_TAGS)) {
      if (negated) dislikedFoods.add(tag);
      else preferredFoods.add(tag);
    }
    if (!negated) {
      for (const tag of matchTags(clause, ACTIVITY_TAGS)) preferredActivities.add(tag);
      for (const tag of matchTags(clause, ATMOSPHERE_TAGS)) preferredAtmospheres.add(tag);
    }

    if (/강아지|반려견|애견|댕댕/.test(clause) && !negated) mustHave.add('PET_FRIENDLY');
    if (/휠체어|계단\s?없|엘리베이터/.test(clause)) mustHave.add('STEP_FREE');
    if (/웨이팅|줄\s?서|오래\s?기다/.test(clause)) mustAvoid.add('LONG_WAIT');
    if (/시끄러운|붐비|사람\s?많/.test(clause)) mustAvoid.add('CROWDED');
    if (/매운|맵/.test(clause) && negated) mustAvoid.add('SPICY');
  }

  return {
    preferredFoods: [...preferredFoods],
    dislikedFoods: [...dislikedFoods],
    allergies: [...allergies],
    preferredActivities: [...preferredActivities],
    preferredAtmospheres: [...preferredAtmospheres],
    budget: extractBudget(text),
    mustHave: [...mustHave],
    mustAvoid: [...mustAvoid],
  };
}

/** "3만원 정도", "2~4만원", "20000원" 같은 표현을 범위로 만든다. */
export function extractBudget(text: string): { min: number; max: number; currency: string } | null {
  const range = text.match(/(\d+)\s*[~-]\s*(\d+)\s*만\s*원/);
  if (range) {
    return { min: Number(range[1]) * 10000, max: Number(range[2]) * 10000, currency: 'KRW' };
  }
  const man = text.match(/(\d+)\s*만\s*원/);
  if (man) {
    const center = Number(man[1]) * 10000;
    return { min: Math.round(center * 0.7), max: Math.round(center * 1.3), currency: 'KRW' };
  }
  const won = text.match(/(\d{4,7})\s*원/);
  if (won) {
    const center = Number(won[1]);
    return { min: Math.round(center * 0.7), max: Math.round(center * 1.3), currency: 'KRW' };
  }
  return null;
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock-ai';
  private places = new MockPlaceProvider();
  private routes = new MockRouteProvider();

  async askNextQuestion(input: InterviewTurnInput): Promise<InterviewTurnOutput> {
    const next = input.questionIndex; // 0-based로 다음 질문
    if (next >= Math.min(input.targetQuestionCount, interviewPolicy.maxTurns)) {
      return { nextQuestion: null, isComplete: true };
    }
    // 답이 너무 짧으면 한 번 더 물어본다.
    if (input.userAnswer.trim().length < 2 && next > 0) {
      return { nextQuestion: '조금만 더 자세히 알려주실 수 있을까요?', isComplete: false };
    }
    return { nextQuestion: QUESTIONS[next] ?? null, isComplete: next >= QUESTIONS.length };
  }

  async extractPreferences(
    history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>,
  ): Promise<PreferenceExtractionOutput> {
    const userText = history.filter((m) => m.role === 'USER').map((m) => m.content).join(' ');
    return extractFromText(userText);
  }

  async generateCourse(input: CourseGenerationInput): Promise<GeneratedCourse> {
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
      const picked = pickBest(accepted, input.aggregated);
      if (!picked) continue;

      const prev = items[items.length - 1];
      const travel =
        prev && prev.latitude !== null && prev.longitude !== null
          ? await this.routes.estimateMinutes(
              { latitude: prev.latitude, longitude: prev.longitude },
              { latitude: picked.latitude, longitude: picked.longitude },
            )
          : 0;

      const startAt = new Date(cursor.getTime() + travel * 60_000);
      items.push({
        sequence: items.length + 1,
        category: slot.category,
        title: `${categoryLabel(slot.category)} - ${picked.name}`,
        placeId: picked.placeId,
        placeName: picked.name,
        address: picked.address,
        latitude: picked.latitude,
        longitude: picked.longitude,
        startAt,
        endAt: new Date(startAt.getTime() + slot.durationMinutes * 60_000),
        estimatedPricePerPerson: picked.averagePricePerPerson,
        reason: buildReason(picked, input.aggregated),
        travelMinutesFromPrev: travel,
        fixedScheduleId: null,
      });
      usedPlaceIds.push(picked.placeId);
      cursor = new Date(startAt.getTime() + slot.durationMinutes * 60_000);
    }

    const total = items.reduce((sum, i) => sum + i.estimatedPricePerPerson, 0);
    return {
      title: `${input.meeting.areaName} ${describeMood(input.meeting.atmosphereTags)} 코스`,
      summary: `${input.meeting.areaName}에서 ${items.length}곳을 도는 ${Math.round(
        (cursor.getTime() - input.meeting.scheduledStartAt.getTime()) / 3_600_000,
      )}시간 코스예요.`,
      estimatedBudgetPerPerson: total,
      items,
    };
  }

  async regenerateItem(input: ItemRegenerationInput): Promise<GeneratedCourseItem> {
    const candidates = await this.places.search({ area: input.areaName, category: input.target.category, limit: 30 });
    const pool = [...candidates, ...input.availablePlaces].filter(
      (p) => p.category === input.target.category,
    );
    const { accepted } = filterPlaces(pool, {
      aggregated: input.aggregated,
      rejectedPlaceIds: input.rejectedPlaceIds,
      usedPlaceIds: [],
      visitStartAt: input.target.startAt,
      visitEndAt: input.target.endAt,
    });

    const picked = pickBest(accepted, input.aggregated);
    if (!picked) throw new Error('SAFETY_CONSTRAINT_UNVERIFIED');

    return {
      sequence: input.target.sequence,
      category: input.target.category,
      title: `${categoryLabel(input.target.category)} - ${picked.name}`,
      placeId: picked.placeId,
      placeName: picked.name,
      address: picked.address,
      latitude: picked.latitude,
      longitude: picked.longitude,
      // 카테고리와 시간대는 그대로 유지한다.
      startAt: input.target.startAt,
      endAt: input.target.endAt,
      estimatedPricePerPerson: picked.averagePricePerPerson,
      reason: `앞선 장소에서 이동하기 좋고, ${buildReason(picked, input.aggregated)}`,
      travelMinutesFromPrev: 10,
      fixedScheduleId: null,
    };
  }
}

// ── 내부 헬퍼 ───────────────────────────────────────────────────────

type Slot =
  | { kind: 'PLACE'; category: CourseItemCategory; durationMinutes: number }
  | { kind: 'FIXED'; fixed: CourseGenerationInput['fixedSchedules'][number] };

/** 약속 시간대와 취향을 보고 코스 뼈대를 짠다. 픽스 일정은 시간 순서대로 끼워 넣는다. */
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

/** 선호 태그를 많이 만족하고 예산에 가까운 곳을 고른다. */
function pickBest(candidates: PlaceCandidate[], aggregated: AggregatedPreference): PlaceCandidate | null {
  if (candidates.length === 0) return null;
  const budgetMax = aggregated.budget?.max ?? Number.POSITIVE_INFINITY;

  return [...candidates].sort((a, b) => {
    const scoreA = (a.petFriendly ? 1 : 0) + (a.averagePricePerPerson <= budgetMax ? 1 : 0);
    const scoreB = (b.petFriendly ? 1 : 0) + (b.averagePricePerPerson <= budgetMax ? 1 : 0);
    return scoreB - scoreA || a.averagePricePerPerson - b.averagePricePerPerson;
  })[0]!;
}

function buildReason(place: PlaceCandidate, aggregated: AggregatedPreference): string {
  const bits: string[] = [];
  if (aggregated.mustHave.includes('PET_FRIENDLY') && place.petFriendly) bits.push('반려견과 함께 들어갈 수 있어요');
  if (aggregated.allergies.length > 0) bits.push('알레르기 정보를 확인했어요');
  if (aggregated.budget && place.averagePricePerPerson <= aggregated.budget.max) bits.push('예산 안에 들어와요');
  if (bits.length === 0) bits.push('참여자들이 선호한 분위기와 잘 맞아요');
  return `${bits.join(', ')}.`;
}

function describeMood(tags: string[]): string {
  if (tags.includes('SPECIAL')) return '특별한 날';
  if (tags.includes('QUIET')) return '조용한';
  return '편안한';
}

export function categoryLabel(category: CourseItemCategory): string {
  const labels: Record<CourseItemCategory, string> = {
    CAFE: '카페',
    LUNCH: '점심',
    DINNER: '저녁식사',
    WALK: '산책',
    EXHIBITION: '전시',
    ACTIVITY: '체험',
    SHOPPING: '쇼핑',
    BAR: '술집',
  };
  return labels[category];
}
