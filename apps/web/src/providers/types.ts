import type { CourseItemCategory, PlaceCandidate, AggregatedPreference } from '@oneulcourse/core';

/**
 * 외부 연동 어댑터 인터페이스.
 * 환경변수가 없으면 Mock 구현이, 있으면 실제 구현이 주입된다.
 * 도메인·API 코드는 이 인터페이스에만 의존한다.
 */

// ── AI ──────────────────────────────────────────────────────────────

export interface PreferenceExtractionOutput {
  preferredFoods: string[];
  dislikedFoods: string[];
  allergies: string[];
  preferredActivities: string[];
  /** "보드게임카페"처럼 사용자가 직접 말한 구체적 장소 키워드. 검색어 우선순위 1순위로 쓴다. */
  activityKeywords: string[];
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
  fixedSchedules: Array<{
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    placeName: string;
    address: string | null;
    placeId: string | null;
    latitude: number | null;
    longitude: number | null;
    category: CourseItemCategory;
  }>;
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
  /** 재생성 대상이 식사 카테고리일 때, 같은 코스의 다른 식사 장소 이름 — 메뉴가 겹치지 않게 고르는 데 쓴다. */
  otherMealPlaceNames: string[];
  availablePlaces: PlaceCandidate[];
  rejectedPlaceIds: string[];
}

export interface AiProvider {
  readonly name: string;
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
  /**
   * category를 지정하지 않고 카테고리별로 한 번에 후보를 모을 때(코스 생성 초기 단계),
   * 카테고리별로 우선 쓸 구체적 검색어. 없으면 각 Provider의 대표 키워드로 대체한다.
   */
  categoryKeywords?: Partial<Record<CourseItemCategory, string>>;
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
