import type { CourseItemCategory, PlaceCandidate, AggregatedPreference } from '@oneulcourse/core';

/**
 * 외부 연동 어댑터 인터페이스.
 * 환경변수가 없으면 Mock 구현이, 있으면 실제 구현이 주입된다.
 * 도메인·API 코드는 이 인터페이스에만 의존한다.
 */

// ── AI ──────────────────────────────────────────────────────────────

export interface InterviewTurnInput {
  questionIndex: number;
  targetQuestionCount: number;
  history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>;
  userAnswer: string;
}

export interface InterviewTurnOutput {
  nextQuestion: string | null;
  isComplete: boolean;
}

export interface PreferenceExtractionOutput {
  preferredFoods: string[];
  dislikedFoods: string[];
  allergies: string[];
  preferredActivities: string[];
  preferredAtmospheres: string[];
  budget: { min: number; max: number; currency: string } | null;
  mustHave: string[];
  mustAvoid: string[];
}

export interface CourseGenerationInput {
  meeting: {
    title: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    areaName: string;
    relationshipTags: string[];
    atmosphereTags: string[];
    specialNotes: string | null;
    participantCount: number;
  };
  aggregated: AggregatedPreference;
  fixedSchedules: Array<{ id: string; title: string; startAt: Date; endAt: Date; placeName: string }>;
  availablePlaces: PlaceCandidate[];
  rejectedPlaceIds: string[];
}

export interface GeneratedCourseItem {
  sequence: number;
  category: CourseItemCategory;
  title: string;
  placeId: string | null;
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  startAt: Date;
  endAt: Date;
  estimatedPricePerPerson: number;
  reason: string;
  travelMinutesFromPrev: number;
  fixedScheduleId: string | null;
}

export interface GeneratedCourse {
  title: string;
  summary: string;
  estimatedBudgetPerPerson: number;
  items: GeneratedCourseItem[];
}

export interface ItemRegenerationInput {
  meetingTitle: string;
  areaName: string;
  aggregated: AggregatedPreference;
  target: {
    category: CourseItemCategory;
    startAt: Date;
    endAt: Date;
    sequence: number;
  };
  neighbours: { previousPlaceName: string | null; nextPlaceName: string | null };
  availablePlaces: PlaceCandidate[];
  rejectedPlaceIds: string[];
}

export interface AiProvider {
  readonly name: string;
  askNextQuestion(input: InterviewTurnInput): Promise<InterviewTurnOutput>;
  extractPreferences(history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>): Promise<PreferenceExtractionOutput>;
  generateCourse(input: CourseGenerationInput): Promise<GeneratedCourse>;
  regenerateItem(input: ItemRegenerationInput): Promise<GeneratedCourseItem>;
}

// ── 장소·동선 ───────────────────────────────────────────────────────

export interface PlaceSearchQuery {
  area: string;
  category?: CourseItemCategory;
  query?: string;
  limit?: number;
}

export interface PlaceProvider {
  readonly name: string;
  search(query: PlaceSearchQuery): Promise<PlaceCandidate[]>;
  getById(placeId: string): Promise<PlaceCandidate | null>;
}

export interface RouteProvider {
  readonly name: string;
  /** 두 지점 사이의 예상 이동시간(분) */
  estimateMinutes(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
    mode?: 'WALKING' | 'TRANSIT' | 'WALKING_TRANSIT',
  ): Promise<number>;
}

// ── 알림·저장소 ─────────────────────────────────────────────────────

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  meetingId?: string;
  linkUrl?: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(payload: NotificationPayload): Promise<void>;
}

export interface PresignedUpload {
  uploadUrl: string;
  fileUrl: string;
  storageKey: string;
  expiresAt: Date;
}

export interface StorageProvider {
  readonly name: string;
  /** 사진은 서버를 거치지 않고 Presigned URL로 직접 올린다. */
  createPresignedUpload(params: { userId: string; contentType: string; extension: string }): Promise<PresignedUpload>;
  remove(storageKey: string): Promise<void>;
}

// ── 인증 ────────────────────────────────────────────────────────────

export interface OAuthProfile {
  providerAccountId: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
}

export interface AuthProviderAdapter {
  readonly name: string;
  readonly enabled: boolean;
  buildAuthorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthProfile>;
}
