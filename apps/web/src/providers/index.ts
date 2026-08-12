import { env, isKakaoLoginEnabled } from '@/lib/env';
import type {
  AiProvider,
  AuthProviderAdapter,
  NotificationProvider,
  PlaceProvider,
  RouteProvider,
  StorageProvider,
} from './types';
import { LocalRouteProvider } from './local/place';
import { DisabledKakaoAuthProvider, LocalNotificationProvider, LocalStorageProvider } from './local/misc';
import { KakaoAuthProvider } from './kakao/auth';
import { KakaoPlaceProvider } from './kakao/place';
import { GeminiAiProvider } from './gemini/ai';
import { SupabaseStorageProvider } from './supabase/storage';

/**
 * Provider 레지스트리. 애플리케이션 코드는 언제나 이 함수들만 부른다.
 *
 * AI/장소는 항상 실제 Provider(Gemini/카카오)만 쓴다 — 키가 없으면 이 함수
 * 호출 시점이 아니라 실제 API 호출 시점에 실패한다. 로컬 개발용 폴백은 없다.
 * Route/Notification은 애초에 실제 구현체가 없어 `local/`의 단순 구현체가
 * 지금의 유일한 구현이다 (이름은 Mock이 아니라 Local — 조건부로 켜고 끄는
 * 대체품이 아니라 현재 서비스가 실제로 쓰는 구현체라서). Storage는 Supabase
 * 환경변수가 설정된 경우에만 실제 구현을 쓰고, 없으면 `LocalStorageProvider`로
 * 폴백한다(로컬 개발 편의용).
 */

let aiSingleton: AiProvider | null = null;
let placeSingleton: PlaceProvider | null = null;
let routeSingleton: RouteProvider | null = null;
let notificationSingleton: NotificationProvider | null = null;
let storageSingleton: StorageProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!aiSingleton) {
    aiSingleton = new GeminiAiProvider(env.GEMINI_API_KEY!, env.GEMINI_MODEL);
  }
  return aiSingleton;
}

export function getPlaceProvider(): PlaceProvider {
  if (!placeSingleton) {
    placeSingleton = new KakaoPlaceProvider(env.KAKAO_REST_API_KEY!);
  }
  return placeSingleton;
}

export function getRouteProvider(): RouteProvider {
  if (!routeSingleton) routeSingleton = new LocalRouteProvider();
  return routeSingleton;
}

export function getNotificationProvider(): NotificationProvider {
  if (!notificationSingleton) notificationSingleton = new LocalNotificationProvider();
  return notificationSingleton;
}

export function getStorageProvider(): StorageProvider {
  if (!storageSingleton) {
    storageSingleton = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseStorageProvider(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_STORAGE_BUCKET)
      : new LocalStorageProvider();
  }
  return storageSingleton;
}

export function getKakaoAuthProvider(): AuthProviderAdapter {
  return isKakaoLoginEnabled()
    ? new KakaoAuthProvider(env.KAKAO_CLIENT_ID!, env.KAKAO_CLIENT_SECRET!)
    : new DisabledKakaoAuthProvider();
}

/** 관리자 화면·README 확인용. 지금 어떤 Provider가 붙어 있는지 알려준다. */
export function describeProviders() {
  return {
    ai: getAiProvider().name,
    place: getPlaceProvider().name,
    route: getRouteProvider().name,
    notification: getNotificationProvider().name,
    storage: getStorageProvider().name,
    kakaoAuth: getKakaoAuthProvider().enabled ? 'kakao' : 'disabled',
  };
}
