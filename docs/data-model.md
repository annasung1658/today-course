# 데이터 모델

스키마 원본: [`apps/web/prisma/schema.prisma`](../apps/web/prisma/schema.prisma)

모든 시각은 UTC로 저장하고 API에서 ISO 8601로 직렬화합니다.

## 전체 구조

```
User ──┬── UserPreference          장기 기본 설정 (알레르기 별도 필드)
       ├── NotificationSetting
       ├── Account / Session        카카오 연동, 세션
       └── Participant ──┐
                         │
Meeting ─────────────────┤
  ├── FixedSchedule      │  AI가 건드릴 수 없는 일정
  ├── Invitation         │
  ├── AiInterview ───────┤  참여자당 1개
  │     ├── InterviewMessage       원문. 본인만 조회
  │     └── ExtractedPreference    추출 결과. 사용자가 수정 가능
  ├── Course
  │     └── CourseItem
  │           └── CourseVote        (항목, 사용자) 유일
  ├── RejectedPlace                 재생성 시 재추천 금지 목록
  ├── AiJob                         비동기 작업
  ├── MeetingRecord
  │     ├── RecordPhoto
  │     └── RecordPost ── RecordComment
  └── Feedback ── FeedbackItem
```

## 핵심 모델

### Course

투표 창의 기준이 되는 모델입니다.

| 필드 | 설명 |
| --- | --- |
| `votingStartedAt` | 코스 생성 완료 시각 |
| `votingEndsAt` | `votingStartedAt + 60분`. **생성 후 절대 변경하지 않음** |
| `eligibleParticipantCount` | 과반수 계산의 분모. 생성 시점에 고정 |
| `status` | `VOTING` / `CONFIRMED` / `CANCELLED` |

`eligibleParticipantCount`를 저장해두는 이유: 투표 도중 참여자 수가 바뀌어도
과반수 기준이 흔들리지 않아야 합니다. 판정 기준이 중간에 달라지면
"방금 전엔 통과였는데 지금은 아니다" 같은 상황이 생깁니다.

### CourseItem

재생성 이력이 여기에 쌓입니다.

| 필드 | 설명 |
| --- | --- |
| `generationVersion` | 1부터 증가. 늦은 투표를 걸러내는 기준 |
| `regenerationCount` | 재생성 횟수 |
| `status` | `ACTIVE` / `REGENERATION_QUEUED` / `REGENERATING` / `REPLACED` / `LOCKED` |
| `revoteEndsAt` | **교체된 항목만** 값이 있음. `min(재생성완료 + 10분, course.votingEndsAt)` |
| `regeneratedAt` | 재생성 완료 시각 |
| `replacedByItemId` | 교체 이력 추적 |
| `fixedScheduleId` | 값이 있으면 픽스 일정. 투표 대상 아님 |

교체는 **덮어쓰기가 아니라 새 레코드 생성**입니다.
이전 항목은 `REPLACED`로 남겨 이력을 보존하고, 새 항목의 투표는 0부터 시작합니다.
조회 시 `status != REPLACED` 조건으로 현재 항목만 가져옵니다.

### CourseVote

```prisma
@@unique([courseItemId, userId])
```

한 항목에 한 사람은 한 표만 가집니다. `upsert`로 처리하므로
좋아요 → 싫어요 변경은 새 행을 만들지 않고 갱신합니다.

`itemGenerationVersion`은 투표 당시의 항목 버전입니다.
요청에 담긴 값이 현재 버전과 다르면 `STALE_COURSE_ITEM`으로 거절합니다.

### AiJob

```prisma
@@unique([courseItemId, targetGenerationVersion, type])
```

이 제약이 재생성 중복 실행을 막습니다.
여러 명이 거의 동시에 마지막 싫어요를 눌러도 작업은 하나만 만들어집니다.

| 타입 | 설명 |
| --- | --- |
| `COURSE_GENERATION` | 코스 생성 |
| `ITEM_REGENERATION` | 항목 재생성 |
| `CLOSE_RESPONSES` | 응답 마감 (예약 실행) |
| `FINALIZE_COURSE` | 자동 확정 (`votingEndsAt`에 예약) |
| `SEND_REMINDER` | 리마인더 |

### RejectedPlace

```prisma
@@unique([meetingId, placeId])
```

과반수 싫어요를 받은 장소를 약속 단위로 기록합니다.
재생성할 때 이 목록을 제외하므로 같은 곳이 다시 나오지 않습니다.

### InterviewMessage

인터뷰 원문입니다. **본인만 조회할 수 있습니다.**
`getResponseStatus`는 이 테이블을 아예 읽지 않고 참여자 상태만 반환합니다.

### IdempotencyRecord

```prisma
@@unique([key, userId, endpoint])
```

`Idempotency-Key`가 같고 요청 본문 해시도 같으면 저장된 응답을 그대로 돌려줍니다.
해시가 다르면 `ALREADY_PROCESSED`로 막습니다.

## 주요 인덱스

| 모델 | 인덱스 | 용도 |
| --- | --- | --- |
| `Meeting` | `(status, responseDeadlineAt)` | 스케줄러의 마감 대상 조회 |
| `Course` | `(status, votingEndsAt)` | 자동 확정 대상 조회 |
| `CourseItem` | `(courseId, status)` | 현재 항목만 조회 |
| `CourseVote` | `(courseItemId, vote)` | 과반수 집계 |
| `AiJob` | `(status, scheduledAt)` | 크론 큐 |
| `Notification` | `(userId, readAt)` | 안 읽은 알림 개수 |

## 상태 전이

### Meeting

```
INVITING → COLLECTING_RESPONSES → GENERATING → VOTING → CONFIRMED → COMPLETED
                    │                  │
                    │                  └─► GENERATION_FAILED (방장 재시도 가능)
                    └─► CANCELLED
```

### CourseItem

```
ACTIVE ──과반수 싫어요──► REGENERATION_QUEUED ──► REGENERATING ──► REPLACED
   │                                                  │
   │                                                  └─(실패)─► ACTIVE 로 복귀
   └──재생성 3회 소진──► LOCKED
```

새로 만들어진 교체 항목은 `ACTIVE` + `revoteEndsAt` 값을 갖고 시작합니다.
3회째 재생성으로 만들어진 항목은 곧바로 `LOCKED`이 됩니다. 광고 확인 후 횟수와 해당 항목 투표를 초기화할 수 있습니다.
