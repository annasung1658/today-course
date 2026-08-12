import type { RouteProvider } from '@/providers/types';

/**
 * 좌표 직선거리 기반 근사 이동시간.
 * 실제 카카오 길찾기 API 연동이 아직 없어 이게 현재 유일한 이동시간 계산 구현체다.
 */
export class LocalRouteProvider implements RouteProvider {
  readonly name = 'local-route';

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
