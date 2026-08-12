'use client';

import { useEffect, useRef, useState } from 'react';
import { loadKakaoMapsSdk, type KakaoSearchResult } from '@/lib/kakao-maps';

export interface SelectedPlace {
  placeName: string;
  address: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * 카카오맵 키워드 검색으로 실제 장소를 골라 좌표·주소까지 함께 받는 입력창.
 * apiKey가 없으면(JS 키 미설정) 검색 없이 이름만 직접 입력하는 일반 텍스트 필드로 동작한다 —
 * 이 경우 placeId/주소/좌표는 비워서 저장된다.
 */
export function PlaceSearchInput({
  apiKey,
  value,
  onSelect,
  placeholder,
  id,
}: {
  apiKey: string | null;
  value: string;
  onSelect: (place: SelectedPlace) => void;
  placeholder?: string;
  id?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<KakaoSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!apiKey || !query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      loadKakaoMapsSdk(apiKey)
        .then(() => {
          if (cancelled || !window.kakao) return;
          const places = new window.kakao.maps.services.Places();
          places.keywordSearch(query, (found, status) => {
            if (cancelled) return;
            if (status === window.kakao!.maps.services.Status.OK) {
              setResults(found.slice(0, 6));
              setOpen(true);
            } else {
              setResults([]);
            }
          });
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiKey, query]);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        className="field"
        placeholder={placeholder ?? (apiKey ? '장소 이름으로 검색' : '장소 이름')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect({ placeName: e.target.value, address: null, placeId: null, latitude: null, longitude: null });
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
        required
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-50"
                onClick={() => {
                  setQuery(result.place_name);
                  setOpen(false);
                  onSelect({
                    placeName: result.place_name,
                    address: result.road_address_name || result.address_name || null,
                    placeId: `kakao_${result.id}`,
                    latitude: Number(result.y),
                    longitude: Number(result.x),
                  });
                }}
              >
                <span className="block truncate font-semibold text-ink-900">{result.place_name}</span>
                <span className="block truncate text-xs text-ink-500">
                  {result.road_address_name || result.address_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
