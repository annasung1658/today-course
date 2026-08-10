import { authedRoute } from '@/lib/api/handler';
import { getVotingState } from '@/server/voting-service';

/**
 * 투표 화면이 폴링하는 엔드포인트.
 * 카운트다운 값을 매초 내려주지 않고 endsAt + serverTime만 준다.
 */
export const GET = authedRoute<{ courseId: string }, unknown>(async ({ params, session }) =>
  getVotingState(params.courseId, session.userId),
);
