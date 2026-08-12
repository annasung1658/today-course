/** 화면 표시용 포맷. 모두 Asia/Seoul 기준으로 보여준다. */
const TZ = 'Asia/Seoul';

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(iso));
}

export function formatCurrency(won: number): string {
  return `${won.toLocaleString('ko-KR')}원`;
}

export const categoryLabels: Record<string, string> = {
  BREAKFAST: '아침식사',
  CAFE: '카페',
  LUNCH: '점심',
  DINNER: '저녁식사',
  WALK: '산책',
  EXHIBITION: '전시',
  ACTIVITY: '체험',
  SHOPPING: '쇼핑',
  BAR: '술집',
};

export const participantStatusLabels: Record<string, string> = {
  INVITED: '초대됨',
  JOINED: '참여',
  INTERVIEW_IN_PROGRESS: '인터뷰 진행 중',
  INTERVIEW_COMPLETED: '응답 완료',
  NO_RESPONSE: '미응답',
  DECLINED: '거절',
};

export const meetingStatusLabels: Record<string, string> = {
  DRAFT: '작성 중',
  INVITING: '초대 중',
  COLLECTING_RESPONSES: '취향 수집 중',
  GENERATING: 'AI 코스 생성 중',
  VOTING: '투표 중',
  CONFIRMED: '확정',
  COMPLETED: '완료',
  CANCELLED: '취소됨',
  GENERATION_FAILED: '생성 실패',
};
