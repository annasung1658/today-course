import { describe, expect, it } from 'vitest';
import { canScheduleMeeting, meetingRecordWindow, meetingRemovalScope } from '@/lib/meeting-lifecycle';

describe('약속 날짜와 기록 기간', () => {
  const appointment = new Date('2026-08-13T00:30:00+09:00');

  it('한국 시간 약속 당일 00시부터 기록이 열린다', () => {
    expect(meetingRecordWindow(appointment, new Date('2026-08-12T23:59:59+09:00')).available).toBe(false);
    expect(meetingRecordWindow(appointment, new Date('2026-08-13T00:00:00+09:00')).writable).toBe(true);
  });

  it('다음 날 00시에 지난 약속으로 이동한다', () => {
    expect(meetingRecordWindow(appointment, new Date('2026-08-13T23:59:59+09:00')).isPast).toBe(false);
    expect(meetingRecordWindow(appointment, new Date('2026-08-14T00:00:00+09:00')).isPast).toBe(true);
  });

  it('지난 약속 전환 후 이틀 동안 작성하고 이후에는 읽기만 가능하다', () => {
    expect(meetingRecordWindow(appointment, new Date('2026-08-15T23:59:59+09:00')).writable).toBe(true);
    const closed = meetingRecordWindow(appointment, new Date('2026-08-16T00:00:00+09:00'));
    expect(closed.available).toBe(true);
    expect(closed.writable).toBe(false);
  });

  it('오늘 일정은 허용하고 어제 일정은 거부한다', () => {
    const now = new Date('2026-08-11T13:00:00+09:00');
    expect(canScheduleMeeting(new Date('2026-08-11T00:00:00+09:00'), now)).toBe(true);
    expect(canScheduleMeeting(new Date('2026-08-10T23:59:59+09:00'), now)).toBe(false);
  });
});

describe('약속 삭제 범위', () => {
  it('방장은 전체 삭제, 참여자는 개인 목록 삭제만 가능하다', () => {
    expect(meetingRemovalScope(true, 'JOINED')).toBe('EVERYONE');
    expect(meetingRemovalScope(false, 'JOINED')).toBe('MEMBER_ONLY');
  });

  it('참여자가 아니거나 이미 나간 사용자는 삭제할 수 없다', () => {
    expect(meetingRemovalScope(false, null)).toBe('FORBIDDEN');
    expect(meetingRemovalScope(false, 'DECLINED')).toBe('FORBIDDEN');
  });
});
