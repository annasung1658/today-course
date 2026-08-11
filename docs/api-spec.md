# API 명세

버전 `v1`. 모든 경로는 `/api/v1` 아래에 있습니다.

## 공통 규칙

### 인증

로그인하면 `oc_session` httpOnly 쿠키가 발급됩니다. 브라우저는 이 쿠키만으로 동작합니다.
외부 클라이언트는 `Authorization: Bearer <token>` 헤더도 쓸 수 있습니다.

### 응답 봉투

성공:

```json
{
  "success": true,
  "data": { },
  "meta": { "requestId": "...", "timestamp": "2026-08-15T10:00:00.000Z" }
}
```

실패:

```json
{
  "success": false,
  "error": {
    "code": "REVOTE_WINDOW_CLOSED",
    "message": "이 항목의 재투표 시간이 끝났습니다.",
    "details": { }
  },
  "meta": { "requestId": "...", "timestamp": "2026-08-15T10:00:00.000Z" }
}
```

### 시각

모든 시각은 UTC ISO 8601로 주고받습니다.
마감 판정은 **서버 시간으로만** 합니다. 클라이언트가 보낸 시간은 신뢰하지 않습니다.

카운트다운이 필요한 응답에는 `serverTime`이 함께 들어갑니다.
브라우저는 이 값으로 자기 시계와의 오차를 보정합니다
([`use-server-countdown.ts`](../apps/web/src/hooks/use-server-countdown.ts)).

### 멱등성

중복 실행되면 곤란한 요청은 `Idempotency-Key` 헤더를 받습니다.
같은 키 + 같은 본문이면 저장된 응답을 그대로 돌려주고,
같은 키 + 다른 본문이면 `ALREADY_PROCESSED`로 막습니다. 보관 기간은 24시간입니다.

적용 대상: 약속 생성, 초대 수락, 인터뷰 제출, 투표.

### 오류 코드

| 코드 | HTTP | 의미 |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | 입력값 형식 오류 |
| `UNAUTHORIZED` | 401 | 로그인 필요 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `RESOURCE_NOT_FOUND` | 404 | 대상 없음 |
| `MEETING_NOT_FOUND` | 404 | 약속방 없음 |
| `ALREADY_PROCESSED` | 409 | 이미 처리된 요청 |
| `INVALID_MEETING_STATUS` | 409 | 현재 상태에서 불가능한 작업 |
| `STALE_COURSE_ITEM` | 409 | 교체된 항목에 대한 늦은 투표 |
| `CAPACITY_EXCEEDED` | 409 | 인원 초과 |
| `INVITATION_EXPIRED` | 410 | 초대 링크 만료 |
| `RESPONSE_DEADLINE_PASSED` | 410 | 취향 응답 마감됨 |
| `VOTING_CLOSED` | 410 | 코스 60분 투표 종료 |
| `REVOTE_WINDOW_CLOSED` | 410 | 해당 항목의 재투표 10분 종료 |
| `INTERVIEW_INCOMPLETE` | 422 | 인터뷰 미완료 |
| `SAFETY_CONSTRAINT_UNVERIFIED` | 422 | 안전조건을 확인할 수 있는 장소 없음 |
| `REGENERATION_LIMIT_REACHED` | 422 | 재생성 횟수 소진 |
| `RATE_LIMITED` | 429 | 요청 과다 |
| `AI_GENERATION_FAILED` | 500 | 코스 생성 실패 |
| `INTERNAL_ERROR` | 500 | 그 외 |

전체 목록은 [`errors.ts`](../apps/web/src/lib/api/errors.ts)에 있습니다.

---

## 엔드포인트

### 인증

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/auth/signup` | POST | 이메일 회원가입. 성공 시 세션 쿠키 발급 |
| `/auth/login` | POST | 로그인. 계정 존재 여부를 노출하지 않도록 실패 메시지를 통일 |
| `/auth/logout` | POST | 세션 쿠키 삭제 |
| `/auth/kakao` | GET | 카카오 인가 화면으로 리다이렉트. 미설정 시 로그인 화면으로 되돌림 |
| `/auth/kakao/callback` | GET | 콜백 처리 후 `returnTo`로 복귀 |

### 사용자

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/users/me` | GET, PATCH | 내 정보 조회·수정 |
| `/users/me/preferences` | GET, PUT | 장기 기본 설정. **알레르기는 비선호와 분리된 필드** |
| `/preference-options` | GET | 화면에서 쓰는 선택지 목록 (태그 값과 라벨) |
| `/home` | GET | 홈 요약. 내가 지금 해야 할 일부터 내려줌 |
| `/system/time` | GET | 서버 시간. 카운트다운 보정용 |

### 약속

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/meetings` | GET, POST | 내 약속 목록 / 약속 생성 |
| `/meetings/{meetingId}` | GET, PATCH | 상세 조회 / 수정. **AI 생성 시작 후에는 수정 불가** |
| `/meetings/{meetingId}/cancel` | POST | 취소 (방장만) |
| `/meetings/{meetingId}/participants` | GET | 참여자 목록과 응답 여부 |
| `/meetings/{meetingId}/response-status` | GET | 응답 현황. **인터뷰 원문은 포함하지 않음** |
| `/meetings/{meetingId}/invitations` | POST | 초대 링크 생성 (방장만) |

`POST /meetings` 요청 예시:

```json
{
  "title": "토요일 성수 나들이",
  "scheduledStartAt": "2026-08-15T07:00:00.000Z",
  "scheduledEndAt": "2026-08-15T13:00:00.000Z",
  "area": { "name": "성수동" },
  "capacity": 6,
  "relationshipTags": ["FRIENDS"],
  "atmosphereTags": ["CASUAL", "TRENDY"],
  "fixedSchedules": [
    {
      "title": "영화 예매",
      "startAt": "2026-08-15T10:00:00.000Z",
      "endAt": "2026-08-15T12:00:00.000Z",
      "placeName": "CGV 왕십리"
    }
  ],
  "specialNotes": "한 명이 강아지를 데려와요"
}
```

픽스 일정은 서로 겹칠 수 없고 약속 시간 범위 안에 있어야 합니다.
검증 규칙은 [`schemas.ts`](../apps/web/src/server/schemas.ts)의 `createMeetingSchema`에 있습니다.

### 초대

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/invitations/{inviteCode}` | GET | 초대장 미리보기. **로그인 없이 조회 가능**, 참여자 명단은 미노출 |
| `/invitations/{inviteCode}/accept` | POST | 참여 |
| `/invitations/{inviteCode}/decline` | POST | 거절 |

코스 생성이 이미 시작된 약속에는 새로 합류할 수 없습니다 (`INVALID_MEETING_STATUS`).

### AI 인터뷰

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/meetings/{meetingId}/interviews` | POST | 인터뷰 시작. `loadDefaultPreferences`로 기본 설정 불러오기 |
| `/meetings/{meetingId}/interviews/me` | GET | 내 인터뷰 조회 |
| `/interviews/{interviewId}/messages` | POST | 답변 전송. 매 턴마다 추출 결과를 갱신 |
| `/interviews/{interviewId}/extracted-preferences` | GET, PATCH | 추출 결과 확인·수정 |
| `/interviews/{interviewId}/submit` | POST | 제출 |
| `/interviews/{interviewId}/reopen` | POST | 다시 열기. **코스 생성 전에만 가능** |

**개인정보 처리**

- 인터뷰 원문(`InterviewMessage`)은 **본인만** 조회할 수 있습니다.
  방장에게도 제출 여부만 보입니다.
- AI에는 이메일·전화번호·실명을 전달하지 않고 `anonymousParticipantId`만 넘깁니다.
- 미응답자의 장기 기본 설정을 자동으로 끌어다 쓰지 않습니다.

### 코스 생성

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/meetings/{meetingId}/course-generation` | POST | 생성 요청. 보통은 스케줄러가 자동 실행 |
| `/meetings/{meetingId}/course` | GET | 현재 코스 |
| `/ai-jobs/{jobId}` | GET | 비동기 작업 상태 |

AI 결과는 세 단계 검증을 통과해야 저장됩니다.

1. Zod 스키마 검증 (`generatedCourseSchema`)
2. 픽스 일정 보존 검증 — 삭제·시간 변경이 있으면 결과 전체를 버림
3. 타임라인 검증 — 항목 시간이 겹치거나 순서가 틀리면 버림

실패하면 최대 3회 재생성합니다. 그래도 실패하면 `AI_GENERATION_FAILED`이고
약속 상태가 `GENERATION_FAILED`로 바뀌어 방장이 재시도할 수 있습니다.

응답 마감 시점에 아무도 제출하지 않았다면 생성을 강행하지 않고
방장에게 선택지를 돌려줍니다: 마감 연장 / 기본 코스 생성 / 취소.

### 투표

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/courses/{courseId}/voting` | GET | 투표 화면 상태. 4초 간격 폴링 대상 |
| `/courses/{courseId}/items/{itemId}/vote` | PUT | 투표 |
| `/courses/{courseId}/items/{itemId}/vote` | DELETE | 투표 취소 |
| `/courses/{courseId}/items/{itemId}/regeneration` | GET | 재생성 진행 상태 |
| `/courses/{courseId}/confirmation` | GET | 확정 결과 |

`GET /courses/{courseId}/voting` 응답:

```json
{
  "courseId": "...",
  "status": "OPEN",
  "startedAt": "2026-08-15T10:00:00.000Z",
  "endsAt": "2026-08-15T11:00:00.000Z",
  "serverTime": "2026-08-15T10:23:00.000Z",
  "remainingSeconds": 2220,
  "eligibleParticipantCount": 4,
  "requiredDislikeCount": 3,
  "initialWindowMinutes": 60,
  "revoteWindowMinutes": 10,
  "items": [
    {
      "courseItemId": "...",
      "sequence": 3,
      "placeName": "수아레 성수",
      "generationVersion": 2,
      "likeCount": 0,
      "dislikeCount": 0,
      "myVote": null,
      "status": "ACTIVE",
      "phase": "REVOTE",
      "revoteEndsAt": "2026-08-15T10:30:00.000Z",
      "remainingSeconds": 420,
      "regenerationCount": 1,
      "maxRegenerationCount": 3
    }
  ]
}
```

`phase`가 항목의 상태를 알려줍니다.

- `INITIAL` — 최초 항목. 코스 60분 창을 따름
- `REVOTE` — 교체된 항목. 자기 10분 창을 따름
- `CLOSED` — 이 항목만 닫힘

`PUT .../vote` 요청:

```json
{ "vote": "DISLIKE", "itemGenerationVersion": 2 }
```

`itemGenerationVersion`은 필수입니다.
값이 현재 버전과 다르면 `STALE_COURSE_ITEM`으로 거절합니다.
항목이 교체된 뒤 옛 화면에서 누른 투표가 새 항목에 잘못 반영되는 것을 막습니다.

투표 저장과 과반수 판정은 **하나의 트랜잭션**에서 처리합니다.
과반수에 도달하면 같은 트랜잭션 안에서 재생성 작업(`AiJob`)을 만들고,
`(courseItemId, targetGenerationVersion, type)` 고유 제약이 중복 실행을 막습니다.

**시간 규칙**

- 코스 창: 생성 완료 + 60분. 재생성으로 바뀌지 않음
- 재투표 창: 재생성 완료 + 10분, 단 코스 종료시간을 넘지 않음
- 자동 확정 판정: `votingEndsAt` 하나만 봄

자세한 배경은 [ADR 0001](adr/0001-voting-window.md)에 있습니다.

### 기록

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/meetings/{meetingId}/record` | GET, POST | 기록 조회 / 생성 |
| `/meeting-records/{recordId}/photos` | POST | 사진 등록 |
| `/meeting-records/{recordId}/posts` | POST | 글 작성 |
| `/meeting-records/{recordId}/posts/{postId}` | PATCH, DELETE | 수정(작성자만) / 삭제(작성자 또는 방장) |
| `/meeting-records/posts/{postId}/comments` | POST | 댓글 |
| `/meeting-records/calendar` | GET | 월별 캘린더 |
| `/uploads/presigned-url` | POST | 사진 업로드용 Presigned URL |

사진은 서버를 거치지 않고 Presigned URL로 스토리지에 직접 올립니다.

### 피드백

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/meetings/{meetingId}/feedbacks/me/draft` | GET, POST, PATCH | 임시 저장 |
| `/meetings/{meetingId}/feedbacks/me/submit` | POST | 제출 |
| `/feedbacks/{feedbackId}/preference-updates` | POST | **사용자가 승인한** 항목만 기본 설정에 반영 |

제출 응답의 메시지는 다음 문구로 고정되어 있습니다.

```
감사합니다.
의견을 다음 AI 코스 추천에 반영할게요.
```

피드백은 기본 설정을 **자동으로 바꾸지 않습니다.**
반영할 만한 항목을 제안만 하고, 사용자가 승인해야 저장됩니다.

### 알림

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/notifications` | GET | 목록 + 안 읽은 개수 |
| `/notifications/{notificationId}/read` | PATCH | 읽음 처리 |
| `/notifications/read-all` | POST | 전체 읽음 |

웹사이트이므로 푸시 알림 대신 인앱 알림 센터를 씁니다.

### 내부

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/internal/scheduler/tick` | POST | 크론 진입점. `x-cron-secret` 헤더 필요 |

한 번 호출되면 세 가지를 처리합니다.

1. 마감 시각이 지난 약속의 응답 마감 + 코스 생성 예약
2. `votingEndsAt`이 지난 코스의 자동 확정
3. 마감 60분 전 / 10분 전 리마인더 발송

확정 시점에 재생성이 진행 중이면 짧은 유예시간(기본 20초)만 기다렸다가,
끝나지 않으면 직전 정상 항목으로 확정합니다.
