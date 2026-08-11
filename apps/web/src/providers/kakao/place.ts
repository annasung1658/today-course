import type { CourseItemCategory, PlaceCandidate } from '@oneulcourse/core';
import type { PlaceProvider, PlaceSearchQuery } from '@/providers/types';

/**
 * 카카오 로컬 API(키워드 검색) 기반 실제 장소 Provider.
 *
 * 한계: 카카오 로컬 API는 영업시간·1인 가격·반려동반·알레르기 정보를 주지 않는다.
 * 이 필드들은 filterPlaces()의 안전조건 판정에 쓰이는데, 확인 불가(null)로 두면
 * "안전한 쪽으로 판단해 제외"하는 게 이 서비스의 정책이라 알레르기가 있는
 * 참가자가 있으면 실제 데이터로는 식사 장소가 전부 걸러질 수 있다 — 의도된 동작이다.
 * 영업시간만은 데이터가 아예 없으면 모든 곳이 "휴무"로 판정돼 아무 것도 못 고르게 되므로,
 * 편의상 매일 09:00~23:00으로 채운다(실제 영업시간이 아님을 명심할 것).
 */

const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/**
 * 카테고리별 대표 키워드 후보(검색어 우선순위 2순위) — 사용자가 구체적으로 말한 게
 * 없을 때만 쓴다(예: "체험하고 싶어" 수준으로만 말한 경우).
 * 카카오 키워드 검색은 여러 단어를 한 문장으로 합치면 "그 단어들이 다 들어간 곳"으로
 * 좁게 매칭해서 결과가 0건이 되기 쉽다 — 합치지 않고 하나씩 순서대로 시도한다.
 */
const CATEGORY_KEYWORD_MAP: Record<CourseItemCategory, string[]> = {
  CAFE: ['카페'],
  LUNCH: ['맛집'],
  DINNER: ['맛집'],
  WALK: ['공원', '산책로'],
  EXHIBITION: ['전시', '미술관'],
  ACTIVITY: ['놀거리', '액티비티'],
  SHOPPING: ['쇼핑'],
  BAR: ['술집', '바'],
};

const FALLBACK_HOURS = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '09:00', close: '23:00' }]),
) as PlaceCandidate['openingHours'];

interface KakaoKeywordDocument {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string; // longitude
  y: string; // latitude
}

interface KakaoKeywordResponse {
  documents: KakaoKeywordDocument[];
}

function toPlaceCandidate(doc: KakaoKeywordDocument, category: CourseItemCategory): PlaceCandidate {
  return {
    placeId: `kakao_${doc.id}`,
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    latitude: Number(doc.y),
    longitude: Number(doc.x),
    category,
    petFriendly: null,
    petFriendlyVerifiedAt: null,
    allergenInfo: null,
    allergenVerifiedAt: null,
    openingHours: FALLBACK_HOURS,
    averagePricePerPerson: 0,
  };
}

export class KakaoPlaceProvider implements PlaceProvider {
  readonly name = 'kakao-local';

  constructor(private readonly restApiKey: string) {}

  async search(query: PlaceSearchQuery): Promise<PlaceCandidate[]> {
    if (query.category) {
      // 1순위: 지역명 + 사용자가 직접 입력한 구체적 키워드(query.query).
      // 없으면 2순위(대표 키워드 조합)로 searchOne 안에서 대체된다.
      return this.searchOne(query.area, query.category, query.query, query.limit ?? 15);
    }
    // 카테고리 지정이 없으면(코스 생성 초기 후보 수집) 카테고리별로 나눠서 모아온다.
    // 그렇지 않으면 카페 같은 한 카테고리만 오게 되어 다른 슬롯(점심·쇼핑 등)에
    // 후보가 하나도 없는 상태가 된다.
    const categories = Object.keys(CATEGORY_KEYWORD_MAP) as CourseItemCategory[];
    const perCategoryLimit = Math.max(5, Math.floor((query.limit ?? 80) / categories.length));
    const results = await Promise.all(
      categories.map((category) =>
        // 카테고리별로 사용자가 구체적으로 말한 키워드(1순위)가 있으면 그걸 쓰고,
        // 없으면 searchOne이 대표 키워드 조합(2순위)으로 대체한다.
        this.searchOne(query.area, category, query.categoryKeywords?.[category], perCategoryLimit).catch(() => []),
      ),
    );
    return results.flat();
  }

  private async searchOne(
    area: string,
    category: CourseItemCategory,
    freeTextQuery: string | undefined,
    limit: number,
  ): Promise<PlaceCandidate[]> {
    const candidates = freeTextQuery ? [freeTextQuery] : CATEGORY_KEYWORD_MAP[category];

    // 대표 키워드가 여러 개면(예: WALK의 "공원"/"산책로") 합치지 않고 하나씩 시도해서,
    // 결과가 있는 첫 키워드를 쓴다. 전부 0건이면 마지막 결과(빈 배열)를 그대로 돌려준다.
    let last: PlaceCandidate[] = [];
    for (const term of candidates) {
      const url = new URL(KAKAO_KEYWORD_ENDPOINT);
      url.searchParams.set('query', `${area} ${term}`);
      url.searchParams.set('size', String(Math.min(limit, 15)));

      const res = await fetch(url, { headers: { Authorization: `KakaoAK ${this.restApiKey}` } });
      if (!res.ok) throw new Error(`카카오 로컬 API 오류 (${res.status}): ${await res.text()}`);

      const data = (await res.json()) as KakaoKeywordResponse;
      last = data.documents.map((doc) => toPlaceCandidate(doc, category));
      if (last.length > 0) return last;
    }
    return last;
  }

  async getById(): Promise<PlaceCandidate | null> {
    // 카카오 로컬 API는 id 단건 조회를 지원하지 않는다. 현재 앱에서도 쓰이지 않는다.
    return null;
  }
}
