# 작업 방식

## 브랜치

| 브랜치 | 용도 |
| --- | --- |
| `main` | 배포 기준. 직접 커밋하지 않음 |
| `dev` | 통합 브랜치. 기능 브랜치는 여기로 병합 |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | 작업 브랜치 |

```bash
git checkout dev
git pull
git checkout -b feat/voting-timer

# 작업 후
npm run verify
git push -u origin feat/voting-timer
# dev 로 PR
```

## 커밋 메시지

Conventional Commits를 씁니다.

```
feat: 재투표 창을 항목 단위로 분리
fix: 교체된 항목에 도착한 늦은 투표 거절
docs: 투표 시간 정책 ADR 추가
refactor: 정책값을 core 패키지로 이동
test: 확정 유예시간 경계 테스트 추가
chore: Next.js 15.5.23 으로 업그레이드
```

## 병합 전 확인

```bash
npm run verify   # typecheck → lint → test → build
```

전부 통과해야 병합합니다.

## 코드 작성 규칙

**정책값은 `packages/core/src/config/policy.ts`에만 둡니다.**
다른 파일에 `60`, `10`, `2` 같은 숫자를 다시 적지 마세요.
정책을 바꿀 때 여러 곳을 찾아다니게 되고, 하나를 빠뜨리면 조용히 깨집니다.

**트랜잭션은 `src/server`에만 둡니다.**
라우트 핸들러는 입력 검증과 권한 확인까지만 하고 서비스 함수를 부릅니다.

**시간 판정은 서버에서만 합니다.**
클라이언트가 보낸 시각을 마감 판정에 쓰지 마세요.

**AI 응답은 반드시 검증합니다.**
`schemas.ts`의 Zod 스키마를 통과하지 않은 값은 DB에 넣지 않습니다.

**개인정보 경계를 지킵니다.**
- 인터뷰 원문은 본인만 조회
- AI에 실명·이메일·전화번호를 넘기지 않음 (`anonymousParticipantId` 사용)
- 미응답자의 기본 설정을 자동으로 쓰지 않음
- 피드백을 기본 설정에 자동 반영하지 않음 (승인 필요)

**주석은 "왜"를 씁니다.**
코드를 다시 설명하는 주석은 필요 없습니다.
그 선택을 한 이유, 나중에 보면 이상해 보일 만한 부분을 남기세요.

## 새 정책값을 추가할 때

1. `packages/core/src/config/policy.ts`에 값과 주석 추가
2. `packages/core/src/domain/`에 계산 함수 추가
3. 같은 위치에 테스트 추가
4. `docs/policy.md` 표 갱신
5. 정책 결정에 배경이 있다면 `docs/adr/`에 ADR 작성
