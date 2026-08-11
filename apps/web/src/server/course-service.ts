import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { aiPolicy, votingPolicy, calcVotingEndsAt, decideFinalize, validateFixedSchedulesPreserved, validateItemTimeline, closeResponses, eligibleVoterCount } from '@oneulcourse/core';
import { getAiProvider, getPlaceProvider } from '@/providers';
import { loadAggregatedPreferences } from '@/server/voting-service';
import { notify } from '@/server/notification-service';
import { generatedCourseSchema } from '@/server/schemas';
import type { PrismaRow, PrismaTx } from '@/server/prisma-types';

/**
 * 응답 마감 → 단일 코스 생성 → 60분 투표 시작 → 자동 확정.
 * 모든 시각 판정은 서버 시간으로만 한다.
 */

/** 응답 마감 시각에 스케줄러가 호출한다. */
export async function closeResponsesAndQueueGeneration(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { participants: true },
  });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.status !== 'COLLECTING_RESPONSES' && meeting.status !== 'INVITING') {
    throw apiError('INVALID_MEETING_STATUS');
  }

  const outcome = closeResponses(
    meeting.participants.map((p: PrismaRow) => ({
      participantId: p.id,
      userId: p.userId,
      status: p.status,
    })),
  );

  // 미응답자는 NO_RESPONSE로 바꾸되, 그들의 기본 설정을 대신 쓰지는 않는다.
  await prisma.participant.updateMany({
    where: { id: { in: outcome.noResponseParticipantIds } },
    data: { status: 'NO_RESPONSE' },
  });
  await prisma.meeting.update({ where: { id: meetingId }, data: { responsesClosedAt: new Date() } });

  if (outcome.outcome === 'NO_SUBMISSION') {
    // 생성 실패가 아니라 방장의 선택으로 넘긴다.
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'COLLECTING_RESPONSES' } });
    return { outcome: 'NO_SUBMISSION' as const, hostOptions: ['EXTEND_DEADLINE', 'GENERATE_DEFAULT', 'CANCEL'] };
  }

  await notify.responsesClosed(meetingId);
  const job = await queueCourseGeneration(meetingId);
  return { outcome: 'GENERATE' as const, jobId: job.id, submittedCount: outcome.submittedUserIds.length };
}

export async function queueCourseGeneration(meetingId: string) {
  const existing = await prisma.aiJob.findFirst({
    where: { meetingId, type: 'COURSE_GENERATION', status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (existing) return existing;

  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'GENERATING' } });
  const job = await prisma.aiJob.create({
    data: { meetingId, type: 'COURSE_GENERATION', status: 'QUEUED' },
  });

  // 서버리스 환경은 응답을 보내는 즉시 인스턴스를 얼릴 수 있어, after()로 응답 이후에도
  // 이 작업이 끝날 때까지 실행이 보장되게 한다(안 그러면 QUEUED에서 영영 안 돈다).
  after(() => runCourseGeneration(job.id).catch((error) => console.error('[course-generation] failed', error)));
  return job;
}

/**
 * 단일 코스를 만든다. 후보 비교는 하지 않는다.
 * AI 결과는 스키마 검증 → 픽스 일정 보존 검증 → 타임라인 검증을 모두 통과해야 저장한다.
 */
export async function runCourseGeneration(jobId: string): Promise<void> {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'QUEUED') return;

  await prisma.aiJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });

  try {
    const meeting = await prisma.meeting.findUniqueOrThrow({
      where: { id: job.meetingId },
      include: { fixedSchedules: true, participants: true },
    });

    const aggregated = await loadAggregatedPreferences(meeting.id);
    const rejected = await prisma.rejectedPlace.findMany({ where: { meetingId: meeting.id } });
    // 검색어 1순위: 참가자가 직접 말한 구체적 키워드("보드게임카페" 등). 없으면 각 카테고리의
    // 대표 키워드 조합(2순위)으로 Provider가 알아서 대체한다.
    const places = await getPlaceProvider().search({
      area: meeting.areaName,
      limit: 100,
      categoryKeywords: aggregated.activityKeywords[0] ? { ACTIVITY: aggregated.activityKeywords[0] } : undefined,
    });

    const generated = await generateWithValidation({
      meeting: {
        title: meeting.title,
        scheduledStartAt: meeting.scheduledStartAt,
        scheduledEndAt: meeting.scheduledEndAt,
        areaName: meeting.areaName,
        relationshipTags: meeting.relationshipTags,
        atmosphereTags: meeting.atmosphereTags,
        specialNotes: meeting.specialNotes,
        participantCount: meeting.participants.length,
      },
      aggregated,
      fixedSchedules: meeting.fixedSchedules.map((f: PrismaRow) => ({
        id: f.id,
        title: f.title,
        startAt: f.startAt,
        endAt: f.endAt,
        placeName: f.placeName,
      })),
      availablePlaces: places,
      rejectedPlaceIds: rejected.map((r: PrismaRow) => r.placeId),
    });

    const votingStartedAt = new Date();
    const votingEndsAt = calcVotingEndsAt(votingStartedAt);
    const eligible = eligibleVoterCount(
      meeting.participants.map((p: PrismaRow) => ({ participantId: p.id, userId: p.userId, status: p.status })),
    );

    const course = await prisma.$transaction(async (tx: PrismaTx) => {
      const created = await tx.course.create({
        data: {
          meetingId: meeting.id,
          version: 1,
          status: 'VOTING',
          title: generated.title,
          summary: generated.summary,
          estimatedBudgetPerPerson: generated.estimatedBudgetPerPerson,
          votingStartedAt,
          votingEndsAt,
          eligibleParticipantCount: eligible,
          items: {
            create: generated.items.map((item) => ({
              sequence: item.sequence,
              category: item.category,
              title: item.title,
              placeId: item.placeId,
              placeName: item.placeName,
              address: item.address,
              latitude: item.latitude,
              longitude: item.longitude,
              startAt: item.startAt,
              endAt: item.endAt,
              estimatedPricePerPerson: item.estimatedPricePerPerson,
              reason: item.reason,
              travelMinutesFromPrev: item.travelMinutesFromPrev,
              fixedScheduleId: item.fixedScheduleId,
              generationVersion: 1,
              maxRegenerationCount: votingPolicy.maxRegenerationPerItem,
              status: 'ACTIVE',
              // 최초 항목에는 재투표 창이 없다. 코스 전체 60분 창을 따른다.
              revoteEndsAt: null,
            })),
          },
        },
      });

      await tx.meeting.update({ where: { id: meeting.id }, data: { status: 'VOTING' } });
      await tx.aiJob.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', finishedAt: new Date(), result: { courseId: created.id } },
      });

      // 투표 종료 시각에 자동 확정 작업을 예약한다.
      await tx.aiJob.create({
        data: {
          meetingId: meeting.id,
          type: 'FINALIZE_COURSE',
          status: 'QUEUED',
          scheduledAt: votingEndsAt,
          payload: { courseId: created.id },
        },
      });

      return created;
    });

    await notify.votingStarted(meeting.id, course.id, votingPolicy.initialWindowMinutes);
  } catch (error) {
    // 실패 사유가 AiJob.errorMessage에는 남지만 콘솔엔 안 남아서 로그로 원인을 못 찾았다 — 로그에도 남긴다.
    console.error('[course-generation] failed', { jobId, meetingId: job.meetingId, error });
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorCode: 'AI_GENERATION_FAILED',
        errorMessage: error instanceof Error ? error.message : 'unknown',
      },
    });
    await prisma.meeting.update({ where: { id: job.meetingId }, data: { status: 'GENERATION_FAILED' } });
  }
}

/** 스키마·픽스 일정·타임라인 검증을 통과할 때까지 제한된 횟수만 다시 만든다. */
async function generateWithValidation(input: Parameters<ReturnType<typeof getAiProvider>['generateCourse']>[0]) {
  let lastError = '';

  for (let attempt = 1; attempt <= aiPolicy.maxValidationRetries; attempt += 1) {
    let raw: Awaited<ReturnType<ReturnType<typeof getAiProvider>['generateCourse']>>;
    try {
      raw = await getAiProvider().generateCourse(input);
    } catch (err) {
      // Gemini 호출 자체가 실패해도(네트워크, 파싱 등) 검증 실패와 똑같이 다음 시도로 넘어간다.
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    const parsed = generatedCourseSchema.safeParse(raw);
    if (!parsed.success) {
      lastError = `스키마 검증 실패: ${parsed.error.issues[0]?.message ?? ''}`;
      continue;
    }

    const draft = parsed.data.items.map((i) => ({
      sequence: i.sequence,
      category: i.category,
      startAt: i.startAt,
      endAt: i.endAt,
      placeId: i.placeId,
      fixedScheduleId: i.fixedScheduleId,
    }));

    const fixedCheck = validateFixedSchedulesPreserved(
      draft,
      input.fixedSchedules.map((f) => ({
        id: f.id,
        startAt: f.startAt,
        endAt: f.endAt,
        placeName: f.placeName,
      })),
    );
    if (!fixedCheck.valid) {
      lastError = fixedCheck.violations.join(', ');
      continue;
    }

    const timelineCheck = validateItemTimeline(draft);
    if (!timelineCheck.valid) {
      lastError = timelineCheck.violations.join(', ');
      continue;
    }

    if (parsed.data.items.length < aiPolicy.minCourseItems) {
      lastError = '추천할 수 있는 장소가 부족합니다.';
      continue;
    }

    return parsed.data;
  }

  throw apiError('AI_GENERATION_FAILED', { lastError });
}

/**
 * 자동 확정. votingEndsAt이 지나면 실행한다.
 * 재생성이 진행 중이면 짧은 유예시간만 기다렸다가, 실패하면 직전 정상 항목으로 확정한다.
 */
export async function finalizeCourse(courseId: string) {
  const now = new Date();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { items: true },
  });
  if (!course) throw apiError('RESOURCE_NOT_FOUND');
  if (course.status === 'CONFIRMED') return { courseId, alreadyConfirmed: true };

  const pending = await prisma.aiJob.findFirst({
    where: {
      meetingId: course.meetingId,
      type: 'ITEM_REGENERATION',
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  const decision = decideFinalize({
    course: { votingStartedAt: course.votingStartedAt, votingEndsAt: course.votingEndsAt },
    now,
    hasPendingRegeneration: Boolean(pending),
    pendingStartedAt: pending?.startedAt ?? null,
  });

  if (decision.action === 'NOT_YET') return { courseId, confirmed: false, reason: 'NOT_YET' as const };
  if (decision.action === 'WAIT') {
    return { courseId, confirmed: false, reason: 'WAITING_FOR_REGENERATION' as const, untilAt: decision.untilAt };
  }

  const confirmed = await prisma.$transaction(async (tx: PrismaTx) => {
    // 확정 중복 실행 방지: 이미 확정된 코스면 아무것도 하지 않는다.
    const fresh = await tx.course.findUniqueOrThrow({ where: { id: courseId } });
    if (fresh.status === 'CONFIRMED') return fresh;

    // 유예시간 안에 끝나지 못한 재생성은 되돌리고 직전 항목을 유지한다.
    await tx.courseItem.updateMany({
      where: { courseId, status: { in: ['REGENERATION_QUEUED', 'REGENERATING'] } },
      data: { status: 'ACTIVE' },
    });
    await tx.aiJob.updateMany({
      where: { meetingId: fresh.meetingId, type: 'ITEM_REGENERATION', status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'FAILED', finishedAt: now, errorCode: 'FINALIZE_TIMEOUT' },
    });

    const updated = await tx.course.update({
      where: { id: courseId },
      data: { status: 'CONFIRMED', confirmedAt: now },
    });
    await tx.meeting.update({ where: { id: fresh.meetingId }, data: { status: 'CONFIRMED' } });
    return updated;
  });

  await notify.courseConfirmed(course.meetingId, confirmed.title);
  return { courseId, confirmed: true, confirmedAt: confirmed.confirmedAt };
}

/** 확정된 최종 코스를 읽는다. 교체된 이전 버전 항목은 제외한다. */
export async function getCourse(meetingId: string) {
  const course = await prisma.course.findFirst({
    where: { meetingId },
    orderBy: { version: 'desc' },
    include: {
      items: { where: { status: { not: 'REPLACED' } }, orderBy: { sequence: 'asc' } },
    },
  });
  if (!course) throw apiError('RESOURCE_NOT_FOUND');
  return course;
}
