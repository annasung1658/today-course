# 오늘코스 (today-course)

약속은 잡았는데 어디 갈지 못 정하는 문제를 푸는 서비스입니다.
참여자 각자가 AI와 **따로** 이야기하면, 모인 취향을 합쳐 **하나의 코스**를 추천합니다.
마음에 안 드는 항목만 골라 다시 받을 수 있습니다.

웹사이트입니다. 앱 설치 없이 링크만 공유하면 됩니다.

---

## 목차

- [투표 시간 정책 (중요)](#투표-시간-정책-중요)
- [빠른 시작](#빠른-시작)
- [모노레포 구조](#모노레포-구조)
- [기술 스택](#기술-스택)
- [환경변수](#환경변수)
- [Mock으로 처리한 부분](#mock으로-처리한-부분)
- [스케줄러](#스케줄러)
- [자주 겪는 문제](#자주-겪는-문제)
- [문서](#문서)

---

## 투표 시간 정책 (중요)

기획서에는 "1시간 투표", 초기 API 명세에는 "10분 투표"라고 적혀 있었지만 **둘 다 구버전**입니다.
현재 확정된 규칙은 다음과 같습니다.

| 대상 | 시작 기준 | 길이 | 변경 가능 여부 |
| --- | --- | --- | --- |
| 코스 전체 1차 투표 | **코스 생성 완료 시점** | **60분** | **절대 변경 없음** |
| 재생성된 항목의 재투표 | 해당 항목 재생성 완료 시점 | **10분** | 코스 종료시간을 넘길 수 없음 |

핵심은 두 가지입니다.

1. `Course.votingEndsAt`은 코스가 만들어진 순간 정해지고, **부분 재생성이 몇 번 일어나도 바뀌지 않습니다.**
2. 재투표 창은 **그 항목 하나만 더 짧게 닫히는 창**이지 코스 타이머가 아닙니다.
   코스 자동 확정 판정은 언제나 `votingEndsAt` 하나만 봅니다.

```
코스 생성                                                        코스 확정
   │◄───────────────────────── 60분 ─────────────────────────────►│
   │                                                              │
   │        20분 지점에 저녁 항목 교체                              │
   │              │◄─── 10분 ───►│                                │
   │              │  재투표 가능  │ 이 항목만 먼저 닫힘             │
   │              └──────────────┘                                │
   │                                                              │
   └── 카페·산책·술집 항목은 계속 60분 창을 따름 ──────────────────┘
```

투표 화면은 이 구조를 그대로 보여줍니다. 우측 패널의 큰 시계가 코스 전체 60분이고,
교체된 항목 카드 안에만 10분짜리 짧은 시계가 따로 붙습니다.

관련 코드:

- 정책값: [`packages/core/src/config/policy.ts`](packages/core/src/config/policy.ts)
- 계산 로직: [`packages/core/src/domain/voting.ts`](packages/core/src/domain/voting.ts)
- 테스트: [`packages/core/src/domain/voting.test.ts`](packages/core/src/domain/voting.test.ts)
- 결정 배경: [`docs/adr/0001-voting-window.md`](docs/adr/0001-voting-window.md)

> 시간 관련 숫자는 전부 `policy.ts` 한 곳에만 있습니다.
> 정책을 바꾸려면 그 파일만 고치면 되고, 다른 곳에 `60`이나 `10`을 다시 적지 마세요.

---

## 빠른 시작

필요한 것: Node.js 20.11+, Docker (PostgreSQL용)

```bash
git clone https://github.com/annasung1658/today-course.git
cd today-course
git checkout dev

npm install

cp .env.example .env

# PostgreSQL 실행
npm run db:up

# 스키마 반영 + Prisma 클라이언트 생성
npm run db:generate
npm run db:push

# 시드 데이터
npm run db:seed

npm run dev
```

`http://localhost:3000` 으로 접속합니다.

### 시드로 만들어지는 상태

시드는 **두 개의 타이머가 동시에 도는 화면**을 바로 볼 수 있게 만들어져 있습니다.

| 계정 | 비밀번호 | 역할 |
| --- | --- | --- |
| `jiwoo@example.com` | `test1234` | 방장 |
| `minseok@example.com` | `test1234` | 참여자 |
| `haeun@example.com` | `test1234` | 참여자 (반려견 동반 + 땅콩 알레르기) |
| `taeyang@example.com` | `test1234` | 참여자 |

- 성수동 토요일 모임, 4명 전원 취향 제출 완료
- 코스 생성 후 약 20분 경과 → **코스 투표 약 40분 남음**
- 저녁 항목은 4명 중 3명이 싫어요 → 이미 교체됨 → **그 항목만 재투표 약 7분 남음**
- 하은의 알레르기·반려견 조건 때문에 일부 장소가 후보에서 빠진 결과가 반영되어 있음

### 검증

```bash
npm run verify   # typecheck → lint → test → build
```

개별 실행:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

---

## 모노레포 구조

```
today-course/
├── apps/
│   └── web/                     @oneulcourse/web — Next.js 웹사이트
│       ├── prisma/
│       │   ├── schema.prisma    25개 모델
│       │   └── seed.ts          개발용 시드
│       ├── src/
│       │   ├── app/
│       │   │   ├── (app)/       로그인 후 화면 (상단 GNB 공통 레이아웃)
│       │   │   ├── api/v1/      46개 API 라우트
│       │   │   ├── invite/[code]/   초대장 (비로그인 열람 + OG 메타)
│       │   │   ├── login/  signup/
│       │   │   └── globals.css
│       │   ├── components/      화면 컴포넌트
│       │   ├── hooks/           서버시간 보정 카운트다운
│       │   ├── lib/             세션, API 봉투, 오류, 멱등성
│       │   ├── providers/       외부 연동 어댑터 + Mock
│       │   └── server/          서비스 계층 (트랜잭션이 사는 곳)
│       └── tests/               흐름 통합 테스트
├── packages/
│   └── core/                    @oneulcourse/core — 순수 도메인 로직
│       └── src/
│           ├── config/policy.ts 모든 정책값 단일 출처
│           └── domain/          투표·응답·코스 규칙 + 단위 테스트
├── docs/                        명세 및 설계 문서
├── docker-compose.yml           로컬 PostgreSQL
└── .env.example
```

### 왜 `packages/core`를 분리했나

투표 창 계산, 과반수 판정, 취향 집계, 안전조건 필터는 **DB나 HTTP를 몰라도 되는 규칙**입니다.
분리해두면 이 규칙들을 DB 없이 빠르게 테스트할 수 있고, 나중에 배치 워커나 다른 클라이언트가
생겨도 같은 판정 로직을 그대로 씁니다. 실제로 코어 테스트 46개는 1초 안에 끝납니다.

계층 규칙:

```
packages/core   →  아무것도 import 하지 않음 (순수 함수만)
apps/web/server →  core + prisma + providers 사용, 트랜잭션 담당
apps/web/api    →  server 호출 + 입력 검증만
apps/web/app    →  server 직접 호출(서버 컴포넌트) 또는 fetch(클라이언트)
```

---

## 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | Next.js 15 (App Router) | 서버 컴포넌트로 첫 화면을 서버에서 그리고, 같은 저장소에서 API까지 처리 |
| 언어 | TypeScript (strict) | `noUncheckedIndexedAccess`까지 켬 |
| DB | PostgreSQL 16 + Prisma 6 | 배열 컬럼과 enum을 많이 써서 SQLite로는 대체 불가 |
| 검증 | Zod | 사용자 입력과 **AI 출력**을 같은 방식으로 검증 |
| 스타일 | Tailwind CSS 3 | |
| 인증 | 자체 세션 (jose JWT + httpOnly 쿠키) | 웹사이트라 쿠키가 자연스러움. Authorization 헤더도 병행 허용 |
| 테스트 | Vitest | |

### 디자인 방향

흰 배경, 검정·회색 중심, 연한 파란색 포인트, 경고에만 최소한의 빨간색.
그래디언트와 장식은 쓰지 않습니다. 색상 토큰은 `apps/web/tailwind.config.ts`에 있습니다.

투표 화면의 시그니처는 **중첩된 두 시계**입니다. 화면 구조 자체가 시간 정책을 설명합니다.

접근성: 키보드 포커스 링 유지, 투표 버튼에 `aria-pressed`와 상태를 읽어주는 `aria-label`,
`prefers-reduced-motion` 대응, 카운트다운 숫자는 고정폭(`tabular-nums`)이라 흔들리지 않습니다.

---

## 환경변수

`.env.example`을 `.env`로 복사해 쓰면 됩니다.

**필수**

| 이름 | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `APP_URL` | 초대 링크와 OAuth 리다이렉트에 쓰임 |
| `AUTH_SECRET` | 세션 서명 키. 운영에서는 `openssl rand -base64 32`로 새로 만드세요 |
| `CRON_SECRET` | 스케줄러 엔드포인트 호출 인증 |

**선택 — 없어도 앱이 정상 실행됩니다**

| 이름 | 없을 때 동작 |
| --- | --- |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | 카카오 로그인 버튼이 화면에 나오지 않고, 이메일 로그인만 노출 |
| `KAKAO_REST_API_KEY` | 성수동 실제 장소 20곳으로 만든 Mock 데이터 사용 |
| `OPENAI_API_KEY` | 규칙 기반 Mock AI 사용 (한국어 → 태그 사전 방식) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Presigned URL 흐름만 흉내 냄 |

지금 어떤 어댑터가 붙어 있는지는 `describeProviders()`로 확인할 수 있습니다
([`apps/web/src/providers/index.ts`](apps/web/src/providers/index.ts)).

---

## Mock으로 처리한 부분

외부 키 없이도 전체 흐름이 끝까지 돌아가도록, 실제 구현과 **같은 인터페이스**를 지키는 Mock을 넣었습니다.
키를 채우면 레지스트리가 자동으로 실제 구현을 고릅니다.

| 어댑터 | Mock 동작 | 실제 연동 시 |
| --- | --- | --- |
| `AiProvider` | 한국어 정규식 사전으로 태그 추출, 규칙 기반 코스 생성 | OpenAI Structured Output |
| `PlaceProvider` | 성수동 실제 장소 20곳 (어니언 성수, 서울숲, 몽탄 등) | 카카오 로컬 API |
| `RouteProvider` | 좌표 직선거리(haversine) 기반 근사 이동시간 | 카카오 길찾기 |
| `NotificationProvider` | DB에 알림 레코드만 생성 + 콘솔 출력 | 카카오 알림톡 등 |
| `StorageProvider` | Presigned URL 형태만 흉내 | Supabase Storage |
| `AuthProviderAdapter` | `enabled: false`로 버튼 자체를 숨김 | 카카오 OAuth |

### 확인이 필요한 데이터 항목

**애견동반 가능 여부와 알레르기 정보는 카카오 장소 API만으로는 확정할 수 없습니다.**
Mock 데이터에는 검증 시각 필드(`petFriendlyVerifiedAt`, `allergenVerifiedAt`)를 함께 넣어두었고,
검증되지 않은 장소(`null`)는 **안전한 쪽으로 판단해 추천에서 제외**합니다.

`place_dinner_unknown`("이름없는 식당")이 그 사례로 시드에 들어 있습니다.
반려견 조건이 걸린 약속에서는 이 장소가 후보에서 빠지는 것을 확인할 수 있습니다.

운영에 올릴 때는 별도의 장소 검증 테이블이나 제휴 데이터가 필요합니다.
이 판단이 틀리면 사람이 다칠 수 있는 영역이라, "모르면 추천하지 않는다"를 기본값으로 두었습니다.

---

## 스케줄러

응답 마감, 코스 자동 확정, 리마인더는 크론이 처리합니다.

- 엔드포인트: `POST /api/v1/internal/scheduler/tick`
- 인증: `x-cron-secret` 헤더
- 주기: 1분 (`vercel.json`에 설정)

```bash
# 로컬에서 수동 실행
curl -X POST http://localhost:3000/api/v1/internal/scheduler/tick \
  -H "x-cron-secret: dev-cron-secret"
```

크론 주기가 조금 밀려도 판정은 정확합니다.
"지금이 마감 시각인가"가 아니라 **"마감 시각이 이미 지났는가"**를 서버 시간으로 판단하기 때문입니다.
클라이언트가 보내는 시간은 어떤 경우에도 신뢰하지 않습니다.

---

## 자주 겪는 문제

**`@prisma/client did not initialize yet`**

```bash
npm run db:generate
```

Prisma 클라이언트가 생성되기 전에는 모델 타입이 `any`로 잡힙니다.
`db:generate`를 돌리면 실제 타입이 들어오고, 서비스 계층에 남아 있는 `(tx: any)` 같은
캐스팅은 그때 제거하면 됩니다. (개발 환경 제약으로 미리 지우지 못했습니다.)

**`Can't reach database server at localhost:5432`**

```bash
npm run db:up
docker compose ps   # healthy 인지 확인
```

**투표 버튼이 눌리지 않음**

세 가지 경우가 있습니다. 화면에 각각 다른 안내가 나옵니다.

1. 코스 60분 창이 끝남 → `VOTING_CLOSED`
2. 그 항목의 재투표 10분 창만 끝남 → `REVOTE_WINDOW_CLOSED` (다른 항목은 계속 가능)
3. 그 항목이 재생성 중 → 카드가 "다시 고르는 중"으로 표시됨

**`STALE_COURSE_ITEM` 오류**

항목이 교체된 뒤 옛 버전에 투표하면 나옵니다. 화면이 자동으로 새로고침하니 다시 누르면 됩니다.
교체된 항목의 투표는 **0부터 다시 시작**하는 것이 의도된 동작입니다.

---

## 문서

| 문서 | 내용 |
| --- | --- |
| [`docs/api-spec.md`](docs/api-spec.md) | API 46개 엔드포인트 명세 |
| [`docs/data-model.md`](docs/data-model.md) | 데이터 모델과 주요 제약 |
| [`docs/policy.md`](docs/policy.md) | 정책값 전체 목록과 근거 |
| [`docs/architecture.md`](docs/architecture.md) | 계층 구조와 흐름도 |
| [`docs/adr/0001-voting-window.md`](docs/adr/0001-voting-window.md) | 투표 시간 정책 결정 배경 |
| [`docs/adr/0002-safety-constraints.md`](docs/adr/0002-safety-constraints.md) | 알레르기·애견동반을 다루는 방식 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 브랜치 전략과 작업 방식 |

---

## 이 버전에 없는 기능

의도적으로 뺐습니다. 범위를 좁혀야 핵심 흐름이 제대로 돌아갑니다.

시간 조율 / 공통시간 계산 / 출발 위치 기반 만남 지역 추천 / 그룹 채팅 /
채팅에서 취향 자동 추출 / 코스 후보 3개 비교 / 커뮤니티 / 더치페이 / 예약·결제
