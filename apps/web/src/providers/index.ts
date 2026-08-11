import { env, isKakaoLoginEnabled } from '@/lib/env';
import type {
  AiProvider,
  AuthProviderAdapter,
  NotificationProvider,
  PlaceProvider,
  RouteProvider,
  StorageProvider,
} from './types';
import { MockAiProvider } from './mock/ai';
import { MockPlaceProvider, MockRouteProvider } from './mock/place';
import { DisabledKakaoAuthProvider, MockNotificationProvider, MockStorageProvider } from './mock/misc';
import { KakaoAuthProvider } from './kakao/auth';
import { KakaoPlaceProvider } from './kakao/place';
import { GeminiAiProvider } from './gemini/ai';

/**
 * Provider 레지스트리.
 * 환경변수가 있으면 실제 구현을, 없으면 Mock을 돌려준다.
 * 애플리케이션 코드는 언제나 이 함수들만 부른다.
 */

let aiSingleton: AiProvider | null = null;
let placeSingleton: PlaceProvider | null = null;
let routeSingleton: RouteProvider | null = null;
let notificationSingleton: NotificationProvider | null = null;
let storageSingleton: StorageProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!aiSingleton) {
    aiSingleton = env.GEMINI_API_KEY
      ? new GeminiAiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL)
      : new MockAiProvider();
  }
  return aiSingleton;
}

export function getPlaceProvider(): PlaceProvider {
  if (!placeSingleton) {
    placeSingleton = env.KAKAO_REST_API_KEY
      ? new KakaoPlaceProvider(env.KAKAO_REST_API_KEY)
      : new MockPlaceProvider();
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
  if (!storageSingleton) storageSingleton = new MockStorageProvider();
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
