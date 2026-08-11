# 정책값

모든 값은 [`packages/core/src/config/policy.ts`](../packages/core/src/config/policy.ts) 한 곳에 있습니다.
**다른 파일에 숫자를 다시 적지 마세요.** 정책을 바꿀 때 이 파일만 고치면 됩니다.

## 투표

| 이름 | 값 | 의미 |
| --- | --- | --- |
| `initialWindowMinutes` | 60 | 1차 투표 창. **코스 생성 완료 시점** 기준 |
| `revoteWindowMinutes` | 10 | 재생성된 항목의 재투표 창. 재생성 완료 시점 기준 |
| `maxRegenerationPerItem` | 3 | 항목당 최대 재생성 횟수. 도달 시 `LOCKED`, 광고 확인 후 초기화 가능 |
| `finalizeGracePeriodSeconds` | 20 | 확정 직전 재생성이 진행 중일 때 기다려주는 시간 |
| `endingSoonNoticeMinutes` | 3 | 종료 임박 알림 시점 |

과반수 기준: `floor(투표대상 인원 / 2) + 1`

| 인원 | 필요한 싫어요 |
| --- | --- |
| 2명 | 2명 |
| 3명 | 2명 |
| 4명 | 3명 |
| 5명 | 3명 |
| 6명 | 4명 |

투표 대상 인원은 **취향을 제출한 사람만** 셉니다. 거절자와 미응답자는 분모에서 빠집니다.

배경: [ADR 0001](adr/0001-voting-window.md)

## 응답 수집

| 이름 | 값 | 의미 |
| --- | --- | --- |
| `defaultDeadlineHours` | 5 | 약속 생성 후 기본 응답 마감. 방장이 변경 가능 |
| `reminderMinutesBefore` | `[60, 10]` | 마감 전 리마인더 시점 |
| `useDefaultPreferencesForNonResponders` | `false` | **미응답자의 기본 설정을 자동으로 쓰지 않음** |

마지막 값이 `false`인 이유: 답하지 않은 사람의 과거 취향을 끌어다 쓰면
"내가 말한 적 없는 조건"이 코스에 반영됩니다. 응답은 명시적 행위여야 합니다.

## 인터뷰

| 이름 | 값 | 의미 |
| --- | --- | --- |
| `questionCount` | 4 | 핵심 질문 수 |
| `maxTurns` | 5 | 추가 확인 질문 포함 최대 턴 |

## AI 생성

| 이름 | 값 | 의미 |
| --- | --- | --- |
| `maxValidationRetries` | 3 | 검증 실패 시 재생성 시도 횟수 |
| `minCourseItems` | 3 | 코스 최소 항목 수 |
| `maxCourseItems` | 6 | 코스 최대 항목 수 |

## 초대

| 이름 | 값 | 의미 |
| --- | --- | --- |
| `defaultTtlHours` | 72 | 초대 링크 기본 유효기간 |
| `inviteCodeLength` | 8 | 초대 코드 길이 |

유효기간은 약속 시작시간을 넘지 않도록 잘립니다.

## 기타

| 이름 | 값 | 의미 |
| --- | --- | --- |
| `idempotencyPolicy.retentionHours` | 24 | Idempotency-Key 보관 기간 |
| `meetingPolicy.minCapacity` | 2 | 최소 인원 |
| `meetingPolicy.maxCapacity` | 12 | 최대 인원 |

## 취향 집계 규칙

정책값은 아니지만 정책만큼 중요한 규칙입니다
([`domain/responses.ts`](../packages/core/src/domain/responses.ts)).

| 항목 | 집계 방식 | 이유 |
| --- | --- | --- |
| 알레르기 | **합집합** | 한 명이라도 걸리면 전체 적용. 안전 문제라 다수결 대상이 아님 |
| 필수조건 (`mustHave`) | **합집합** | 반려견 동반 등. 한 명이 못 들어가면 의미 없음 |
| 회피조건 (`mustAvoid`) | **합집합** | |
| 비선호 음식 | **합집합** | 한 명이라도 싫어하면 회피 |
| 선호 음식·활동·분위기 | 빈도순 정렬 | 많이 언급된 것부터 우선 |
| 예산 | **교집합** (max of min, min of max) | 전원이 감당 가능한 범위. 뒤집히면 최저 상한을 따름 |

배경: [ADR 0002](adr/0002-safety-constraints.md)
