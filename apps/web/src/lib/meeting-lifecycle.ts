const DAY = 24 * 60 * 60_000;
const KOREA_OFFSET = 9 * 60 * 60_000;

/** 주어진 시각이 속한 한국 날짜의 00:00을 UTC Date로 반환한다. */
export function koreaDayStart(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')) - KOREA_OFFSET);
}

export function meetingRecordWindow(scheduledStartAt: Date, now = new Date()) {
  const opensAt = koreaDayStart(scheduledStartAt);
  const movesToPastAt = new Date(opensAt.getTime() + DAY);
  const closesAt = new Date(opensAt.getTime() + 3 * DAY);
  return {
    opensAt,
    movesToPastAt,
    closesAt,
    available: now >= opensAt,
    writable: now >= opensAt && now < closesAt,
    isPast: now >= movesToPastAt,
  };
}

export const canScheduleMeeting = (scheduledStartAt: Date, now = new Date()) =>
  scheduledStartAt >= koreaDayStart(now);

export function meetingRemovalScope(isHost: boolean, participantStatus?: string | null) {
  if (isHost) return 'EVERYONE' as const;
  if (participantStatus && participantStatus !== 'DECLINED') return 'MEMBER_ONLY' as const;
  return 'FORBIDDEN' as const;
}
