'use client';

/**
 * Kakao Maps JS SDK 로더 + 최소 타입 선언.
 * 지도 표시(`components/kakao-map.tsx`)와 장소 검색(`components/place-search-input.tsx`)이
 * 같은 SDK 인스턴스를 공유해야 해서 로더를 한 곳에 모아둔다.
 */

export interface KakaoSearchResult {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string; // longitude
  y: string; // latitude
}

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

export function loadKakaoMapsSdk(apiKey: string): Promise<void> {
  if (window.kakao?.maps?.services) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&libraries=services`;
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('KAKAO_SDK_UNAVAILABLE'));
        return;
      }
      window.kakao.maps.load(() => {
        if (!window.kakao?.maps?.services) {
          reject(new Error('KAKAO_SERVICES_UNAVAILABLE'));
          return;
        }
        resolve();
      });
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
