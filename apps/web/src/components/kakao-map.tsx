'use client';

import { useEffect, useRef, useState } from 'react';

interface KakaoSearchResult {
  x: string;
  y: string;
}

/** Kakao Maps JS SDK. 타입 정의가 따로 없어 필요한 만큼만 최소로 선언한다. */
declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        LatLngBounds: new () => { extend: (latlng: unknown) => void };
        Map: new (container: HTMLElement, options: { center: unknown; level: number }) => {
          setBounds: (bounds: unknown) => void;
        };
        CustomOverlay: new (options: {
          position: unknown;
          content: string;
          map: unknown;
          yAnchor: number;
        }) => unknown;
        Polyline: new (options: {
          path: unknown[];
          strokeWeight: number;
          strokeColor: string;
          strokeOpacity: number;
          strokeStyle: string;
          map: unknown;
        }) => unknown;
        services: {
          Status: { OK: string };
          Geocoder: new () => {
            addressSearch: (address: string, callback: (results: KakaoSearchResult[], status: string) => void) => void;
          };
          Places: new () => {
            keywordSearch: (keyword: string, callback: (results: KakaoSearchResult[], status: string) => void) => void;
          };
        };
      };
    };
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadKakaoMapsSdk(apiKey: string): Promise<void> {
  if (window.kakao?.maps?.services) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&libraries=services`;
    script.onload = () => {
      if (!window.kakao?.maps?.services) {
        reject(new Error('KAKAO_SDK_UNAVAILABLE'));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => reject(new Error('카카오 지도를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkLoadPromise = null;
    throw error;
  });

  sdkLoadPromise = promise;
  return promise;
}

export interface MapPoint {
  sequence: number;
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  travelMinutesFromPrev: number;
}

function searchCoordinates(point: MapPoint): Promise<MapPoint> {
  const maps = window.kakao?.maps;
  if (!maps) return Promise.resolve(point);

  const toPoint = (results: KakaoSearchResult[], status: string, resolve: (point: MapPoint) => void) => {
    const result = results[0];
    if (status === maps.services.Status.OK && result) {
      resolve({ ...point, latitude: Number(result.y), longitude: Number(result.x) });
      return true;
    }
    return false;
  };

  return new Promise((resolve) => {
    const searchByName = () => {
      const places = new maps.services.Places();
      places.keywordSearch(point.placeName, (results, status) => {
        if (!toPoint(results, status, resolve)) resolve(point);
      });
    };

    if (!point.address) {
      searchByName();
      return;
    }

    const geocoder = new maps.services.Geocoder();
    geocoder.addressSearch(point.address, (results, status) => {
      if (!toPoint(results, status, resolve)) searchByName();
    });
  });
}

export function KakaoRouteMap({ apiKey, points }: { apiKey: string | null; points: MapPoint[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [mapState, setMapState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [mapError, setMapError] = useState<'SDK' | 'CONFIG' | 'DATA' | null>(null);
  const [displayPoints, setDisplayPoints] = useState(points);
  const signature = points
    .map((point) => `${point.sequence}:${point.placeName}:${point.address ?? ''}:${point.latitude ?? ''}:${point.longitude ?? ''}`)
    .join('|');

  useEffect(() => {
    if (!sectionRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || !apiKey || points.length === 0 || !containerRef.current) return;
    let cancelled = false;
    setMapState('loading');
    setMapError(null);

    loadKakaoMapsSdk(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao) throw new Error('MAP_CANCELLED');
        const { maps } = window.kakao;
        return Promise.all(
          points.map((point) =>
            point.latitude !== null && point.longitude !== null ? Promise.resolve(point) : searchCoordinates(point),
          ),
        ).then((resolvedPoints) => ({ maps, resolvedPoints }));
      })
      .then(({ maps, resolvedPoints }) => {
        if (cancelled || !containerRef.current) return;
        setDisplayPoints(resolvedPoints);
        const located = resolvedPoints.filter(
          (point): point is MapPoint & { latitude: number; longitude: number } =>
            point.latitude !== null && point.longitude !== null,
        );
        if (located.length === 0) throw new Error('KAKAO_COORDINATES_UNAVAILABLE');
        const bounds = new maps.LatLngBounds();
        const positions = located.map((point) => new maps.LatLng(point.latitude, point.longitude));
        positions.forEach((position) => bounds.extend(position));

        const map = new maps.Map(containerRef.current, { center: positions[0], level: 6 });
        new maps.Polyline({
          path: positions,
          strokeWeight: 5,
          strokeColor: '#55aaf1',
          strokeOpacity: 0.82,
          strokeStyle: 'solid',
          map,
        });

        located.forEach((point, index) => {
          new maps.CustomOverlay({
            position: positions[index],
            map,
            yAnchor: 1,
            content: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:13px;background:linear-gradient(145deg,#8ecfff,#3d9fe9);color:#fff;font-size:13px;font-weight:800;border:3px solid #fff;box-shadow:0 8px 18px rgba(47,146,229,.3);">${point.sequence}</div>`,
          });
        });

        map.setBounds(bounds);
        setMapState('ready');
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(
            error instanceof Error && error.message === 'KAKAO_SDK_UNAVAILABLE'
              ? 'CONFIG'
              : error instanceof Error && error.message === 'KAKAO_COORDINATES_UNAVAILABLE'
                ? 'DATA'
                : 'SDK',
          );
          setMapState('error');
        }
      });

    return () => {
      cancelled = true;
    };
    // signature가 좌표 값의 실질적 동등성 키다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, nearViewport, signature]);

  if (points.length === 0) return null;

  return (
    <section ref={sectionRef} className="card overflow-hidden p-0" aria-labelledby="course-map-title">
      <div className="flex items-center justify-between gap-3 border-b border-accent-100 bg-gradient-to-r from-accent-50 to-white px-5 py-4">
        <div>
          <p className="text-xs font-bold text-accent-600">ROUTE MAP</p>
          <h2 id="course-map-title" className="mt-0.5 font-extrabold tracking-tight text-ink-900">
            오늘 코스 한눈에 보기
          </h2>
        </div>
        <span className="chip border-accent-100 bg-white text-accent-700">카카오맵</span>
      </div>

      {apiKey ? (
        <div className="relative h-64 overflow-hidden bg-accent-50 sm:h-80">
          <div ref={containerRef} className="h-full w-full" aria-label="코스 장소 지도" />
          {mapState !== 'ready' && (
            <div className="absolute inset-0 flex items-center justify-center bg-accent-50/95 px-6 text-center">
              <div>
                {mapState !== 'error' && <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-accent-100 border-t-accent-500" />}
                <p className="mt-3 text-sm font-semibold text-accent-700">
                  {mapState === 'error' ? '지도를 불러오지 못했어요' : '코스 지도를 준비하고 있어요'}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {mapError === 'CONFIG'
                    ? '카카오 개발자 콘솔에서 현재 배포 도메인을 허용해 주세요.'
                    : mapError === 'DATA'
                      ? '장소의 주소와 위치 정보를 확인해 주세요.'
                      : '카카오 JavaScript 키와 네트워크 상태를 확인해 주세요.'}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-accent-50 px-5 py-4 text-sm text-accent-700">
          지도 미리보기 대신 장소별 카카오맵 링크를 준비했어요.
        </div>
      )}

      <ol className="divide-y divide-ink-100 px-5">
        {displayPoints.map((point, index) => (
          <li key={`${point.sequence}-${point.placeName}`} className="flex gap-3 py-4">
            <div className="flex flex-col items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-xs font-extrabold text-white shadow-[0_6px_14px_rgba(47,146,229,.24)]">
                {point.sequence}
              </span>
              {index < displayPoints.length - 1 && <span className="mt-1 h-full min-h-3 w-px bg-accent-100" />}
            </div>
            <div className="min-w-0 flex-1">
              {point.travelMinutesFromPrev > 0 && (
                <p className="mb-1 text-xs font-semibold text-accent-600">이전 장소에서 약 {point.travelMinutesFromPrev}분</p>
              )}
              <p className="truncate font-bold text-ink-900">{point.placeName}</p>
              {point.address && <p className="mt-0.5 truncate text-xs text-ink-500">{point.address}</p>}
            </div>
            <a
              href={
                point.latitude !== null && point.longitude !== null
                  ? `https://map.kakao.com/link/map/${encodeURIComponent(point.placeName)},${point.latitude},${point.longitude}`
                  : `https://map.kakao.com/link/search/${encodeURIComponent(point.address || point.placeName)}`
              }
              target="_blank"
              rel="noreferrer"
              className="self-center rounded-xl border border-accent-100 bg-accent-50 px-3 py-2 text-xs font-bold text-accent-700 transition hover:-translate-y-0.5 hover:bg-accent-100"
              aria-label={`${point.placeName} 카카오맵에서 열기`}
            >
              지도 열기
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
