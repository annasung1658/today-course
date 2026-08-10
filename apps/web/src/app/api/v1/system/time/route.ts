import { route } from '@/lib/api/handler';

/** 클라이언트 카운트다운을 서버 시간으로 보정하기 위한 엔드포인트. */
export const GET = route(async () => ({ serverTime: new Date().toISOString(), epochMs: Date.now() }));
