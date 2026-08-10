'use client';

import { useEffect, useState } from 'react';

/**
 * 서버 시간에 맞춘 카운트다운.
 *
 * 서버는 endsAt과 serverTime만 내려주고, 초당 값은 브라우저가 계산한다.
 * 사용자의 시계가 틀어져 있어도 오프셋을 보정하므로 표시가 어긋나지 않는다.
 * 실제 마감 판정은 언제나 서버가 하므로 이 값은 표시 전용이다.
 */
export function useServerCountdown(endsAtIso: string | null, serverTimeIso: string | null) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    if (!endsAtIso || !serverTimeIso) return;

    const offsetMs = new Date(serverTimeIso).getTime() - Date.now();
    const endsAtMs = new Date(endsAtIso).getTime();

    const tick = () => {
      const correctedNow = Date.now() + offsetMs;
      setRemainingSeconds(Math.max(0, Math.floor((endsAtMs - correctedNow) / 1000)));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAtIso, serverTimeIso]);

  return remainingSeconds;
}

/** mm:ss. 1시간 이상이면 h:mm:ss로 늘린다. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
