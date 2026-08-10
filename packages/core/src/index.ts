/**
 * @oneulcourse/core
 *
 * 정책값과 순수 도메인 로직만 담는다.
 * DB·HTTP·React에 의존하지 않으므로 웹 앱, 배치 작업, 테스트 어디서든 그대로 쓴다.
 */
export * from './config/policy';
export * from './domain/voting';
export * from './domain/responses';
export * from './domain/course';
