import { env, isKakaoLoginEnabled } from '@/lib/env';
import type {
  AiProvider,
  AuthProviderAdapter,
  NotificationProvider,
  PlaceProvider,
  RouteProvider,
  StorageProvider,
} from './types';
// 로컬 개발용 Mock 폴백 비활성화(실험) — AI/장소는 항상 실제 Provider(Gemini/카카오)만 쓴다.
// import { MockAiProvider } from './mock/ai';
// import { MockPlaceProvider } from './mock/place';
import { MockRouteProvider } from './mock/place';
import { DisabledKakaoAuthProvider, MockNotificationProvider, MockStorageProvider } from './mock/misc';
import { KakaoAuthProvider } from './kakao/auth';
import { KakaoPlaceProvider } from './kakao/place';
import { GeminiAiProvider } from './gemini/ai';
import { SupabaseStorageProvider } from './supabase/storage';

/**
 * Provider 레지스트리. 애플리케이션 코드는 언제나 이 함수들만 부른다.
 *
 * AI/장소는 (실험적으로) Mock 폴백을 꺼서 항상 실제 Provider만 쓴다 — 키가 없으면
 * 이 함수 호출 시점이 아니라 실제 API 호출 시점에 실패한다.
 * Route/Notification/Storage는 애초에 실제 구현체가 없어 Mock이 유일한 구현이라 그대로 뒀다.
 */

let aiSingleton: AiProvider | null = null;
let placeSingleton: PlaceProvider | null = null;
let routeSingleton: RouteProvider | null = null;
let notificationSingleton: NotificationProvider | null = null;
let storageSingleton: StorageProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!aiSingleton) {
    // aiSingleton = env.GEMINI_API_KEY
    //   ? new GeminiAiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL)
    //   : new MockAiProvider();
    aiSingleton = new GeminiAiProvider(env.GEMINI_API_KEY!, env.GEMINI_MODEL);
  }
  return aiSingleton;
}

export function getPlaceProvider(): PlaceProvider {
  if (!placeSingleton) {
    // placeSingleton = env.KAKAO_REST_API_KEY
    //   ? new KakaoPlaceProvider(env.KAKAO_REST_API_KEY)
    //   : new MockPlaceProvider();
    placeSingleton = new KakaoPlaceProvider(env.KAKAO_REST_API_KEY!);
  }
  return placeSingleton;
}

export function getRouteProvider(): RouteProvider {
  if (!routeSingleton) routeSingleton = new MockRouteProvider();
  return routeSingleton;
}

export function getNotificationProvider(): NotificationProvider {
  if (!notificationSingleton) notificationSingleton = new MockNotificationProvider();
  return notificationSingleton;
}

export function getStorageProvider(): StorageProvider {
  if (!storageSingleton) {
    storageSingleton = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseStorageProvider(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_STORAGE_BUCKET)
      : new MockStorageProvider();
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
