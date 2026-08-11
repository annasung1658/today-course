'use client';

import { useEffect, useMemo, useRef } from 'react';

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
      };
    };
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadKakaoMapsSdk(apiKey: string): Promise<void> {
  if (window.kakao?.maps) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`;
    script.onload = () => window.kakao!.maps.load(() => resolve());
    script.onerror = () => reject(new Error('카카오 지도를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

export interface MapPoint {
  sequence: number;
  placeName: string;
  latitude: number | null;
  longitude: number | null;
}

export function KakaoRouteMap({ apiKey, points }: { apiKey: string | null; points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const located = useMemo(
    () => points.filter((p): p is MapPoint & { latitude: number; longitude: number } => p.latitude !== null && p.longitude !== null),
    [points],
  );
  // 폴링마다 points 배열 참조가 바뀌므로, 좌표 값 자체가 그대로면 지도를 다시 그리지 않는다.
  const signature = located.map((p) => `${p.sequence}:${p.latitude}:${p.longitude}`).join('|');

  useEffect(() => {
    if (!apiKey || located.length === 0 || !containerRef.current) return;
    let cancelled = false;

    loadKakaoMapsSdk(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao) return;
        const { maps } = window.kakao;
        const bounds = new maps.LatLngBounds();
        const positions = located.map((p) => new maps.LatLng(p.latitude, p.longitude));
        positions.forEach((pos) => bounds.extend(pos));

        const map = new maps.Map(containerRef.current, { center: positions[0], level: 6 });

        new maps.Polyline({
          path: positions,
          strokeWeight: 3,
          strokeColor: '#6366f1',
          strokeOpacity: 0.8,
          strokeStyle: 'solid',
          map,
        });

        located.forEach((point, i) => {
          new maps.CustomOverlay({
            position: positions[i],
            map,
            yAnchor: 1,
            content: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:#4f46e5;color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);">${point.sequence}</div>`,
          });
        });

        map.setBounds(bounds);
      })
      .catch(() => {
        // 지도를 못 불러와도 나머지 화면은 정상 동작해야 하니 조용히 넘긴다.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature가 located의 실질적 동등성 키
  }, [apiKey, signature]);

  if (!apiKey || located.length === 0) return null;

  return (
    <div className="card overflow-hidden p-0">
      <div ref={containerRef} className="h-64 w-full sm:h-80" />
    </div>
  );
}
