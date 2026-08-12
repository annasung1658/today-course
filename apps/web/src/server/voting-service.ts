import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import {
  aggregatePreferences,
  buildRegenerationConstraints,
  calcItemRevoteEndsAt,
  canVoteOnItem,
  decideRegeneration,
  isStaleVote,
  itemVotingPhase,
  haveAllEligibleVoted,
  remainingSecondsForCourse,
  remainingSecondsForItem,
  requiredDislikeCount,
  votingPolicy,
  type VoteValue,
} from '@oneulcourse/core';
import { getAiProvider, getPlaceProvider } from '@/providers';
import { notify } from '@/server/notification-service';
import type { PrismaRow, PrismaTx } from '@/server/prisma-types';

/**
 * 투표·부분 재생성 서비스.
 *
 * 시간 규칙(정책 §votingPolicy):
 *  - 코스 전체 투표 창은 생성 완료 + 60분이며 절대 바뀌지 않는다.
 *  - 재생성으로 교체된 항목만 재생성 완료 + 10분의 재투표 창을 갖는다.
 *  - 재투표 창은 코스 종료시간을 넘길 수 없고, 코스 확정 시각에 영향을 주지 않는다.
 */

export interface VotingStateItem {
  courseItemId: string;
  sequence: number;
  category: string;
  title: string;
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  startAt: string;
  endAt: string;
  estimatedPricePerPerson: number;
  reason: string;
  travelMinutesFromPrev: number;
  generationVersion: number;
  likeCount: number;
  dislikeCount: number;
  myVote: VoteValue | null;
  status: string;
  phase: 'INITIAL' | 'REVOTE' | 'CLOSED';
  revoteEndsAt: string | null;
  remainingSeconds: number;
  regenerationCount: number;
  maxRegenerationCount: number;
  isFixedSchedule: boolean;
}

export async function getVotingState(courseId: string, userId: string) {
  const now = new Date();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      items: {
        where: { status: { not: 'REPLACED' } },
        orderBy: { sequence: 'asc' },
        include: { votes: true },
      },
      meeting: { select: { id: true, title: true, participants: { select: { id: true, status: true } } } },
    },
  });
  if (!course) throw apiError('RESOURCE_NOT_FOUND');

  await assertParticipant(course.meetingId, userId);

  // 마지막 투표 응답 직후의 새로고침이 누락되거나 배포 중 요청이 끊겨도,
  // 상태 조회 시 전원 투표 완료 여부를 다시 확인해 타이머가 계속 돌지 않게 한다.
  const finalizedOnRead = course.status === 'VOTING' && (await finalizeCourseWhenAllVoted(courseId));

  const courseWindow = { votingStartedAt: course.votingStartedAt, votingEndsAt: course.votingEndsAt };
  const eligible = course.eligibleParticipantCount;

  const items: VotingStateItem[] = course.items.map((item: PrismaRow) => {
    const votes = item.votes as Array<{ userId: string; vote: VoteValue }>;
    const window = { revoteEndsAt: item.revoteEndsAt, status: item.status };
    return {
      courseItemId: item.id,
      sequence: item.sequence,
      category: item.category,
      title: item.title,
      placeName: item.placeName,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      startAt: item.startAt.toISOString(),
      endAt: item.endAt.toISOString(),
      estimatedPricePerPerson: item.estimatedPricePerPerson,
      reason: item.reason,
      travelMinutesFromPrev: item.travelMinutesFromPrev,
      generationVersion: item.generationVersion,
      likeCount: votes.filter((v) => v.vote === 'LIKE').length,
      dislikeCount: votes.filter((v) => v.vote === 'DISLIKE').length,
      myVote: votes.find((v) => v.userId === userId)?.vote ?? null,
      status: item.status,
      phase: itemVotingPhase(courseWindow, window, now),
      revoteEndsAt: item.revoteEndsAt?.toISOString() ?? null,
      remainingSeconds: remainingSecondsForItem(courseWindow, window, now),
      regenerationCount: item.regenerationCount,
      maxRegenerationCount: votingPolicy.maxRegenerationPerItem,
      isFixedSchedule: item.fixedScheduleId !== null,
    };
  });

  return {
    courseId: course.id,
    meetingId: course.meetingId,
    meetingTitle: course.meeting.title,
    title: course.title,
    summary: course.summary,
    estimatedBudgetPerPerson: course.estimatedBudgetPerPerson,
    status: course.status === 'CONFIRMED' || finalizedOnRead ? ('CLOSED' as const) : ('OPEN' as const),
    startedAt: course.votingStartedAt.toISOString(),
    endsAt: course.votingEndsAt.toISOString(),
    serverTime: now.toISOString(),
    remainingSeconds: course.status === 'CONFIRMED' || finalizedOnRead ? 0 : remainingSecondsForCourse(courseWindow, now),
    eligibleParticipantCount: eligible,
    requiredDislikeCount: requiredDislikeCount(eligible),
    initialWindowMinutes: votingPolicy.initialWindowMinutes,
    revoteWindowMinutes: votingPolicy.revoteWindowMinutes,
    items,
  };
}

export interface CastVoteInput {
  courseId: string;
  itemId: string;
  userId: string;
  vote: VoteValue;
  itemGenerationVersion: number;
}

/**
 * 투표 저장과 과반수 판정을 하나의 트랜잭션에서 처리한다.
 * 재생성이 필요하면 같은 트랜잭션 안에서 AiJob을 만들어 중복 실행을 막는다.
 */
export async function castVote(input: CastVoteInput) {
  const now = new Date();

  const result = await prisma.$transaction(async (tx: PrismaTx) => {
    const item = await tx.courseItem.findUnique({
      where: { id: input.itemId },
      include: { course: true },
    });
    if (!item || item.courseId !== input.courseId) throw apiError('RESOURCE_NOT_FOUND');

    const course = item.course;
    if (course.status === 'CONFIRMED') throw apiError('VOTING_CLOSED');

    // 교체 전 항목에 도착한 늦은 투표는 거절한다.
    if (isStaleVote(input.itemGenerationVersion, item.generationVersion)) {
      throw apiError('STALE_COURSE_ITEM', {
        currentGenerationVersion: item.generationVersion,
      });
    }

    // 픽스 일정은 투표 대상이 아니다.
    if (item.fixedScheduleId) throw apiError('FORBIDDEN', { reason: '픽스 일정은 투표할 수 없습니다.' });

    const gate = canVoteOnItem(
      { votingStartedAt: course.votingStartedAt, votingEndsAt: course.votingEndsAt },
      { revoteEndsAt: item.revoteEndsAt, status: item.status },
      now,
    );
    if (!gate.allowed) {
      if (gate.reason === 'VOTING_CLOSED') throw apiError('VOTING_CLOSED');
      if (gate.reason === 'REVOTE_WINDOW_CLOSED') throw apiError('REVOTE_WINDOW_CLOSED');
      throw apiError('INVALID_MEETING_STATUS', { reason: '지금은 이 항목에 투표할 수 없습니다.' });
    }

    await assertParticipantTx(tx, course.meetingId, input.userId);

    await tx.courseVote.upsert({
      where: { courseItemId_userId: { courseItemId: item.id, userId: input.userId } },
      create: {
        courseItemId: item.id,
        userId: input.userId,
        vote: input.vote,
        itemGenerationVersion: item.generationVersion,
      },
      update: { vote: input.vote, itemGenerationVersion: item.generationVersion },
    });

    const [likeCount, dislikeCount] = await Promise.all([
      tx.courseVote.count({ where: { courseItemId: item.id, vote: 'LIKE' } }),
      tx.courseVote.count({ where: { courseItemId: item.id, vote: 'DISLIKE' } }),
    ]);

    const decision = decideRegeneration({
      dislikeCount,
      eligibleParticipantCount: course.eligibleParticipantCount,
      regenerationCount: item.regenerationCount,
      itemStatus: item.status,
    });

    let itemStatus: string = item.status;

    if (decision.action === 'REGENERATE') {
      itemStatus = 'REGENERATION_QUEUED';
      await tx.courseItem.update({ where: { id: item.id }, data: { status: 'REGENERATION_QUEUED' } });

      // 거절된 장소는 이 약속의 블랙리스트에 남겨 다시 추천하지 않는다.
      if (item.placeId) {
        await tx.rejectedPlace.upsert({
          where: { meetingId_placeId: { meetingId: course.meetingId, placeId: item.placeId } },
          create: {
            meetingId: course.meetingId,
            placeId: item.placeId,
            placeName: item.placeName,
            courseItemId: item.id,
            reason: 'MAJORITY_DISLIKE',
          },
          update: {},
        });
      }

      // courseItemId + generationVersion + type 고유 제약이 중복 작업을 막는다.
      await tx.aiJob.create({
        data: {
          meetingId: course.meetingId,
          courseItemId: item.id,
          type: 'ITEM_REGENERATION',
          status: 'QUEUED',
          targetGenerationVersion: item.generationVersion,
          payload: { courseId: course.id, sequence: item.sequence },
        },
      });
    } else if (decision.action === 'LOCK') {
      itemStatus = 'LOCKED';
      await tx.courseItem.update({ where: { id: item.id }, data: { status: 'LOCKED' } });
    }

    return {
      courseItemId: item.id,
      meetingId: course.meetingId,
      myVote: input.vote,
      likeCount,
      dislikeCount,
      requiredDislikeCount: requiredDislikeCount(course.eligibleParticipantCount),
      regenerationTriggered: decision.action === 'REGENERATE',
      lockedByLimit: decision.action === 'LOCK',
      itemStatus,
    };
  });

  // 트랜잭션 밖에서 실제 재생성을 돌린다. 실패해도 투표는 이미 저장되어 있다.
  // 서버리스 환경은 응답을 보내는 즉시 인스턴스를 얼릴 수 있어, after()로 응답 이후에도
  // 이 작업이 끝날 때까지 실행이 보장되게 한다(안 그러면 QUEUED에서 영영 안 돈다).
  if (result.regenerationTriggered) {
    after(() =>
      runItemRegeneration(input.itemId).catch((error) => {
        console.error('[regeneration] failed', error);
      }),
    );
  }

  const earlyFinalized = result.regenerationTriggered ? false : await finalizeCourseWhenAllVoted(input.courseId);
  return { ...result, earlyFinalized };
}

export async function clearVote(courseId: string, itemId: string, userId: string) {
  const now = new Date();
  const item = await prisma.courseItem.findUnique({ where: { id: itemId }, include: { course: true } });
  if (!item || item.courseId !== courseId) throw apiError('RESOURCE_NOT_FOUND');
  if (item.course.status === 'CONFIRMED') throw apiError('VOTING_CLOSED');

  const gate = canVoteOnItem(
    { votingStartedAt: item.course.votingStartedAt, votingEndsAt: item.course.votingEndsAt },
    { revoteEndsAt: item.revoteEndsAt, status: item.status },
    now,
  );
  // 재생성이 시작된 뒤에는 이전 항목의 투표를 취소할 수 없다.
  if (!gate.allowed) throw apiError('VOTING_CLOSED');

  await prisma.courseVote.deleteMany({ where: { courseItemId: itemId, userId } });
  return { courseItemId: itemId, myVote: null };
}

/** 광고 확인 뒤 잠긴 항목의 재생성 기회와 투표를 초기화한다. */
export async function resetRegenerationAfterAd(courseId: string, itemId: string, userId: string) {
  const item = await prisma.courseItem.findUnique({ where: { id: itemId }, include: { course: true } });
  if (!item || item.courseId !== courseId) throw apiError('RESOURCE_NOT_FOUND');
  await assertParticipant(item.course.meetingId, userId);
  if (item.course.status === 'CONFIRMED') throw apiError('VOTING_CLOSED');
  // 기존 코스는 생성 당시의 최대 횟수(예: 2회)를 저장하고 있을 수 있다.
  // 현재 전역 정책값이 아니라 이 항목에 실제 저장된 한도를 모두 썼는지 판단한다.
  if (item.status !== 'LOCKED' || item.regenerationCount < item.maxRegenerationCount) {
    throw apiError('INVALID_MEETING_STATUS', { reason: '재생성 횟수를 모두 사용한 항목만 초기화할 수 있습니다.' });
  }

  const reset = await prisma.$transaction(async (tx: PrismaTx) => {
    await tx.courseVote.deleteMany({ where: { courseItemId: itemId } });
    return tx.courseItem.update({
      where: { id: itemId },
      data: {
        status: 'ACTIVE',
        regenerationCount: 0,
        maxRegenerationCount: votingPolicy.maxRegenerationPerItem,
        generationVersion: { increment: 1 },
        revoteEndsAt: null,
      },
    });
  });

  return {
    courseItemId: reset.id,
    regenerationCount: reset.regenerationCount,
    maxRegenerationCount: votingPolicy.maxRegenerationPerItem,
    generationVersion: reset.generationVersion,
    status: reset.status,
  };
}

/** 모든 대상자의 모든 항목 투표가 끝나면 남은 시간을 기다리지 않고 코스를 확정한다. */
export async function finalizeCourseWhenAllVoted(courseId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      items: {
        where: { status: { not: 'REPLACED' } },
        include: { votes: { select: { userId: true } } },
      },
      meeting: {
        select: {
          participants: {
            where: { status: 'INTERVIEW_COMPLETED' },
            select: { userId: true },
          },
        },
      },
    },
  });
  if (!course || course.status !== 'VOTING') return false;
  if (course.items.some((item: PrismaRow) => ['REGENERATION_QUEUED', 'REGENERATING'].includes(item.status))) return false;

  const eligibleUserIds = course.meeting.participants.map((participant: PrismaRow) => participant.userId);
  if (eligibleUserIds.length !== course.eligibleParticipantCount) return false;
  const votingItems = course.items.filter((item: PrismaRow) => item.fixedScheduleId === null);
  const completed = haveAllEligibleVoted(
    eligibleUserIds,
    votingItems.map((item: PrismaRow) => ({ voterUserIds: item.votes.map((vote: PrismaRow) => vote.userId) })),
  );
  if (!completed) return false;

  const now = new Date();
  const confirmed = await prisma.$transaction(async (tx: PrismaTx) => {
    const updated = await tx.course.updateMany({
      where: { id: courseId, status: 'VOTING' },
      data: { status: 'CONFIRMED', confirmedAt: now },
    });
    if (updated.count === 0) return false;
    await tx.meeting.update({ where: { id: course.meetingId }, data: { status: 'CONFIRMED' } });
    await tx.aiJob.updateMany({
      where: { meetingId: course.meetingId, type: 'FINALIZE_COURSE', status: 'QUEUED' },
      data: { status: 'SUCCEEDED', finishedAt: now, result: { reason: 'ALL_VOTES_COMPLETED' } },
    });
    return true;
  });

  if (confirmed) await notify.courseConfirmed(course.meetingId, course.title);
  return confirmed;
}

/**
 * 항목 하나만 다시 만든다.
 * 카테고리·시간대·다른 항목·픽스 일정은 그대로 두고 장소만 바꾼다.
 * 새 항목은 재생성 완료 시점부터 10분(코스 종료시간 이내)의 재투표 창을 갖는다.
 */
export async function runItemRegeneration(itemId: string): Promise<void> {
  const job = await prisma.aiJob.findFirst({
    where: { courseItemId: itemId, type: 'ITEM_REGENERATION', status: 'QUEUED' },
    orderBy: { scheduledAt: 'desc' },
  });
  if (!job) return;

  await prisma.aiJob.update({
    where: { id: job.id },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });
  await prisma.courseItem.update({ where: { id: itemId }, data: { status: 'REGENERATING' } });

  try {
    const oldItem = await prisma.courseItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { course: { include: { meeting: true, items: { orderBy: { sequence: 'asc' } } } } },
    });
    const course = oldItem.course;

    const siblings = course.items
      .filter((i: PrismaRow) => i.status !== 'REPLACED')
      .map((i: PrismaRow) => ({
        sequence: i.sequence,
        category: i.category,
        startAt: i.startAt,
        endAt: i.endAt,
        placeId: i.placeId,
        fixedScheduleId: i.fixedScheduleId,
      }));

    const constraints = buildRegenerationConstraints(siblings, oldItem.sequence);
    if (!constraints) throw apiError('RESOURCE_NOT_FOUND');

    const rejected = await prisma.rejectedPlace.findMany({ where: { meetingId: course.meetingId } });
    const aggregated = await loadAggregatedPreferences(course.meetingId);
    // 식사 카테고리는 참가자가 가장 많이 답한 음식 키워드로 검색한다.
    // activityKeywords(예: "소품샵", "도자기 공방")는 카테고리 정보 없이 저장되는 값이라,
    // 실제로 그 키워드가 어떤 카테고리를 가리키는지 알 수 없다 — ACTIVITY/SHOPPING처럼
    // 참가자가 구체적 장소명을 직접 말하는 게 흔한 카테고리에만 한정해서 쓴다.
    // BAR 같은 카테고리에까지 그대로 적용하면 "이자카야를 다시 뽑았는데 소품샵이 나옴"처럼
    // 완전히 관계없는 곳이 검색된다 — 실제로 겪은 버그다.
    const isMealCategory =
      constraints.category === 'BREAKFAST' || constraints.category === 'LUNCH' || constraints.category === 'DINNER';
    const isKeywordCategory = constraints.category === 'ACTIVITY' || constraints.category === 'SHOPPING';
    const topFood = aggregated.preferredFoods[0]?.tag;
    const topActivityKeyword = aggregated.activityKeywords[0];
    const regenerationQuery = isMealCategory ? topFood : isKeywordCategory ? topActivityKeyword : undefined;
    const places = await getPlaceProvider().search({
      area: course.meeting.areaName,
      category: constraints.category,
      limit: 30,
      query: regenerationQuery,
    });

    const generated = await getAiProvider().regenerateItem({
      meetingTitle: course.meeting.title,
      areaName: course.meeting.areaName,
      aggregated,
      target: {
        category: constraints.category,
        startAt: constraints.startAt,
        endAt: constraints.endAt,
        sequence: oldItem.sequence,
      },
      neighbours: { previousPlaceName: null, nextPlaceName: null },
      availablePlaces: places,
      rejectedPlaceIds: [
        ...rejected.map((r: PrismaRow) => r.placeId),
        ...constraints.lockedPlaceIds,
      ],
    });

    const regeneratedAt = new Date();
    const revoteEndsAt = calcItemRevoteEndsAt(regeneratedAt, course.votingEndsAt);

    await prisma.$transaction(async (tx: PrismaTx) => {
      // 이전 항목은 REPLACED로 남겨 이력을 보존한다. 투표는 새 항목에서 0부터 시작한다.
      const created = await tx.courseItem.create({
        data: {
          courseId: course.id,
          sequence: oldItem.sequence,
          category: generated.category,
          title: generated.title,
          placeId: generated.placeId,
          placeName: generated.placeName,
          address: generated.address,
          latitude: generated.latitude,
          longitude: generated.longitude,
          startAt: generated.startAt,
          endAt: generated.endAt,
          estimatedPricePerPerson: generated.estimatedPricePerPerson,
          reason: generated.reason,
          travelMinutesFromPrev: generated.travelMinutesFromPrev,
          generationVersion: oldItem.generationVersion + 1,
          regenerationCount: oldItem.regenerationCount + 1,
          maxRegenerationCount: oldItem.maxRegenerationCount,
          status: oldItem.regenerationCount + 1 >= votingPolicy.maxRegenerationPerItem ? 'LOCKED' : 'ACTIVE',
          revoteEndsAt,
          regeneratedAt,
        },
      });

      await tx.courseItem.update({
        where: { id: oldItem.id },
        data: { status: 'REPLACED', replacedByItemId: created.id },
      });

      await tx.aiJob.update({
        where: { id: job.id },
        data: { status: 'SUCCEEDED', finishedAt: new Date(), result: { newItemId: created.id } },
      });
    });

    await notify.itemRegenerated(course.meetingId, oldItem.sequence, generated.placeName);
  } catch (error) {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'unknown',
      },
    });
    // 실패하면 직전 정상 항목을 그대로 유지한다.
    await prisma.courseItem.update({ where: { id: itemId }, data: { status: 'ACTIVE' } });
  }
}

// ── 공통 헬퍼 ───────────────────────────────────────────────────────

async function assertParticipant(meetingId: string, userId: string) {
  const participant = await prisma.participant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant || participant.status === 'DECLINED') throw apiError('FORBIDDEN');
  return participant;
}

async function assertParticipantTx(tx: PrismaTx, meetingId: string, userId: string) {
  const participant = await tx.participant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant || participant.status === 'DECLINED') throw apiError('FORBIDDEN');
  return participant;
}

export async function loadAggregatedPreferences(meetingId: string) {
  const interviews = await prisma.aiInterview.findMany({
    where: { meetingId, status: 'SUBMITTED' },
    include: { extracted: true },
  });

  return aggregatePreferences(
    interviews
      .filter((i: PrismaRow) => i.extracted)
      .map((i: PrismaRow, index: number) => ({
        anonymousParticipantId: `anon_${index + 1}`,
        preferredFoods: i.extracted!.preferredFoods,
        dislikedFoods: i.extracted!.dislikedFoods,
        allergies: i.extracted!.allergies,
        preferredActivities: i.extracted!.preferredActivities,
        activityKeywords: i.extracted!.activityKeywords,
        preferredAtmospheres: i.extracted!.preferredAtmospheres,
        budget:
          i.extracted!.budgetMin !== null && i.extracted!.budgetMax !== null
            ? {
                min: i.extracted!.budgetMin,
                max: i.extracted!.budgetMax,
                currency: i.extracted!.budgetCurrency,
              }
            : null,
        mustHave: i.extracted!.mustHave,
        mustAvoid: i.extracted!.mustAvoid,
      })),
  );
}
