/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Prisma 클라이언트 생성 전용 임시 타입.
 *
 * `npm run db:generate`를 돌리기 전에는 `@prisma/client`가 모델 타입을 내보내지 않아,
 * 조회 결과와 트랜잭션 클라이언트가 전부 암묵적 any가 된다.
 * 그 any를 코드 곳곳에 흩뿌리는 대신 여기 두 줄로 모아두었다.
 *
 * 로컬에서 `npm run db:generate`를 실행하면 실제 모델 타입이 들어온다.
 * 그 뒤에는 이 파일을 지우고 각 사용처를 Prisma가 생성한 타입
 * (예: `Prisma.TransactionClient`, `Prisma.CourseItemGetPayload<...>`)으로
 * 바꾸는 것이 좋다. 그렇게 하면 쿼리 오타를 컴파일 단계에서 잡을 수 있다.
 */

/** `prisma.$transaction(async (tx) => ...)`의 tx */
export type PrismaTx = any;

/** Prisma 조회 결과 한 행 */
export type PrismaRow = any;
