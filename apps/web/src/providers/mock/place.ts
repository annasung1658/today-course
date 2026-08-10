import type { PlaceCandidate, CourseItemCategory } from '@oneulcourse/core';
import type { PlaceProvider, PlaceSearchQuery, RouteProvider } from '@/providers/types';

/**
 * 개발용 장소 데이터.
 * 카카오 로컬 API 키가 없을 때 쓰며, 실제 API와 같은 형태를 돌려준다.
 * 애견동반·알레르기 필드는 카카오 데이터만으로 확정할 수 없어
 * 실제 서비스에서는 별도 검증 테이블이 필요하다(README 참고).
 */

const VERIFIED = new Date('2026-08-01T00:00:00Z');
const WEEKLY = (open: string, close: string, closedDays: number[] = []) =>
  Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [d, closedDays.includes(d) ? null : { open, close }]),
  ) as PlaceCandidate['openingHours'];

const place = (
  id: string,
  name: string,
  category: CourseItemCategory,
  lat: number,
  lng: number,
  price: number,
  options: Partial<PlaceCandidate> = {},
): PlaceCandidate => ({
  placeId: id,
  name,
  address: `서울특별시 성동구 성수동${id.slice(-1)}가`,
  latitude: lat,
  longitude: lng,
  category,
  petFriendly: false,
  petFriendlyVerifiedAt: VERIFIED,
  allergenInfo: [],
  allergenVerifiedAt: VERIFIED,
  openingHours: WEEKLY('11:00', '22:00'),
  averagePricePerPerson: price,
  ...options,
});

const MOCK_PLACES: PlaceCandidate[] = [
  // 카페
  place('place_cafe_onion', '어니언 성수', 'CAFE', 37.5445, 127.0557, 9000, {
    petFriendly: true,
    openingHours: WEEKLY('08:00', '22:00'),
  }),
  place('place_cafe_daelim', '대림창고', 'CAFE', 37.5421, 127.0554, 11000, { petFriendly: true }),
  place('place_cafe_center', '센터커피 서울숲', 'CAFE', 37.5471, 127.0439, 8500, {
    petFriendly: true,
    openingHours: WEEKLY('09:00', '21:00'),
  }),
  place('place_cafe_lcdc', 'LCDC 서울', 'CAFE', 37.5416, 127.0592, 10000, { petFriendly: false }),

  // 저녁
  place('place_dinner_mongtan', '몽탄', 'DINNER', 37.5401, 127.0466, 32000, {
    petFriendly: false,
    allergenInfo: ['PEANUT'],
    openingHours: WEEKLY('16:00', '23:00', [1]),
  }),
  place('place_dinner_soigne', '수아레 성수', 'DINNER', 37.5448, 127.0561, 28000, {
    petFriendly: true,
    allergenInfo: [],
    openingHours: WEEKLY('17:00', '23:00'),
  }),
  place('place_dinner_izakaya', '이자카야 하나', 'DINNER', 37.5433, 127.0533, 26000, {
    petFriendly: true,
    allergenInfo: ['SHELLFISH'],
    openingHours: WEEKLY('17:00', '24:00'),
  }),
  place('place_dinner_sushi', '스시 코마', 'DINNER', 37.5462, 127.0508, 35000, {
    petFriendly: true,
    allergenInfo: [],
    openingHours: WEEKLY('12:00', '22:00'),
  }),
  // 검증 불가 사례. 애견동반 필수 조건이 있으면 걸러진다.
  place('place_dinner_unknown', '이름없는 식당', 'DINNER', 37.5410, 127.0521, 22000, {
    petFriendly: null,
    petFriendlyVerifiedAt: null,
    allergenInfo: null,
    allergenVerifiedAt: null,
  }),

  // 점심
  place('place_lunch_noodle', '성수 손칼국수', 'LUNCH', 37.5438, 127.0495, 12000, {
    petFriendly: false,
    openingHours: WEEKLY('10:30', '20:00'),
  }),
  place('place_lunch_bapsang', '소담 밥상', 'LUNCH', 37.5455, 127.0472, 15000, { petFriendly: true }),

  // 산책·전시
  place('place_walk_forest', '서울숲', 'WALK', 37.5444, 127.0374, 0, {
    petFriendly: true,
    openingHours: WEEKLY('00:00', '23:59'),
  }),
  place('place_walk_bridge', '성수대교 남단 산책로', 'WALK', 37.5397, 127.0345, 0, {
    petFriendly: true,
    openingHours: WEEKLY('00:00', '23:59'),
  }),
  place('place_exhibit_daelim', '디뮤지엄', 'EXHIBITION', 37.5432, 127.0648, 15000, {
    petFriendly: false,
    openingHours: WEEKLY('11:00', '20:00', [1]),
  }),
  place('place_exhibit_under', '언더스탠드에비뉴', 'EXHIBITION', 37.5449, 127.0403, 5000, { petFriendly: true }),

  // 술집
  place('place_bar_seongsu', '성수 양조장', 'BAR', 37.5427, 127.0559, 25000, {
    petFriendly: true,
    openingHours: WEEKLY('17:00', '01:00'),
  }),
  place('place_bar_wine', '와인바 노드', 'BAR', 37.5451, 127.0546, 30000, {
    petFriendly: false,
    openingHours: WEEKLY('18:00', '02:00'),
  }),
  place('place_bar_pocha', '성수 포차', 'BAR', 37.5419, 127.0501, 20000, {
    petFriendly: true,
    allergenInfo: ['SHELLFISH'],
    openingHours: WEEKLY('18:00', '03:00'),
  }),

  // 쇼핑·체험
  place('place_shop_market', '성수연방', 'SHOPPING', 37.5407, 127.0563, 15000, { petFriendly: true }),
  place('place_activity_pottery', '성수 도자기 공방', 'ACTIVITY', 37.5462, 127.0575, 35000, {
    petFriendly: false,
    openingHours: WEEKLY('10:00', '20:00', [0]),
  }),
];

export class MockPlaceProvider implements PlaceProvider {
  readonly name = 'mock-place';

  async search(query: PlaceSearchQuery): Promise<PlaceCandidate[]> {
    let results = MOCK_PLACES;
    if (query.category) results = results.filter((p) => p.category === query.category);
    if (query.query) {
      const q = query.query.toLowerCase();
      results = results.filter((p) => p.name.toLowerCase().includes(q));
    }
    return results.slice(0, query.limit ?? 20).map((p) => ({ ...p }));
  }

  async getById(placeId: string): Promise<PlaceCandidate | null> {
    const found = MOCK_PLACES.find((p) => p.placeId === placeId);
    return found ? { ...found } : null;
  }
}

/** 좌표 직선거리 기반 근사 이동시간. 실제 서비스에서는 카카오 길찾기로 교체한다. */
export class MockRouteProvider implements RouteProvider {
  readonly name = 'mock-route';

  async estimateMinutes(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
    mode: 'WALKING' | 'TRANSIT' | 'WALKING_TRANSIT' = 'WALKING_TRANSIT',
  ): Promise<number> {
    const km = haversineKm(from, to);
    const speedKmh = mode === 'WALKING' ? 4.5 : mode === 'TRANSIT' ? 18 : 9;
    // 대기·환승 여유 3분을 더한다.
    return Math.max(3, Math.round((km / speedKmh) * 60) + 3);
  }
}

function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const mockPlaces = MOCK_PLACES;
