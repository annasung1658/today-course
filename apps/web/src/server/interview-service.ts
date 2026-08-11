import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { interviewPolicy } from '@oneulcourse/core';
import { getAiProvider } from '@/providers';
import { extractedPreferenceSchema } from '@/server/schemas';
import type { PrismaRow, PrismaTx } from '@/server/prisma-types';

/**
 * AI 취향 인터뷰.
 * 인터뷰 원문(InterviewMessage)은 본인만 조회할 수 있고,
 * 방장과 다른 참여자에게는 제출 여부만 보인다.
 */

const FIRST_QUESTION = '먹고싶은 음식이나 먹기 싫은 음식을 알려주세요.';

export async function startInterview(meetingId: string, userId: string, loadDefaults: boolean) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.responseDeadlineAt < new Date()) throw apiError('RESPONSE_DEADLINE_PASSED');

  const participant = await prisma.participant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant || participant.status === 'DECLINED') throw apiError('FORBIDDEN');

  const existing = await prisma.aiInterview.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    include: { messages: { orderBy: { turn: 'asc' } }, extracted: true },
  });
  if (existing) return serializeInterview(existing);

  const created = await prisma.$transaction(async (tx: PrismaTx) => {
    const interview = await tx.aiInterview.create({
      data: {
        meetingId,
        userId,
        status: 'IN_PROGRESS',
        currentQuestion: 1,
        targetQuestionCount: interviewPolicy.questionCount,
        defaultPreferencesLoaded: loadDefaults,
        messages: { create: { role: 'ASSISTANT', content: FIRST_QUESTION, turn: 0 } },
      },
      include: { messages: { orderBy: { turn: 'asc' } }, extracted: true },
    });

    // "내 기본 설정 불러오기"를 누르면 장기 취향을 초기값으로 채운다.
    if (loadDefaults) {
      const pref = await tx.userPreference.findUnique({ where: { userId } });
      if (pref) {
        await tx.extractedPreference.create({
          data: {
            interviewId: interview.id,
            preferredFoods: pref.preferredFoods,
            dislikedFoods: pref.dislikedFoods,
            allergies: pref.allergies,
            preferredActivities: pref.preferredActivities,
            // 장기 기본 설정엔 구체 키워드 입력란이 없어 빈 값으로 시작한다.
            activityKeywords: [],
            preferredAtmospheres: pref.preferredAtmospheres,
            budgetMin: pref.budgetMin,
            budgetMax: pref.budgetMax,
            budgetCurrency: pref.budgetCurrency,
            mustHave: pref.mustHave,
            mustAvoid: pref.mustAvoid,
          },
        });
      }
    }

    await tx.participant.update({
      where: { meetingId_userId: { meetingId, userId } },
      data: { status: 'INTERVIEW_IN_PROGRESS' },
    });

    return tx.aiInterview.findUniqueOrThrow({
      where: { id: interview.id },
      include: { messages: { orderBy: { turn: 'asc' } }, extracted: true },
    });
  });

  return serializeInterview(created);
}

export async function getMyInterview(meetingId: string, userId: string) {
  const interview = await prisma.aiInterview.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    include: { messages: { orderBy: { turn: 'asc' } }, extracted: true },
  });
  if (!interview) throw apiError('RESOURCE_NOT_FOUND');
  return serializeInterview(interview);
}

const SURVEY_FIELDS: Array<[key: 'foodWant' | 'foodAvoid' | 'activityWant' | 'activityAvoid' | 'budget' | 'notes', question: string]> = [
  ['foodWant', '먹고 싶은 음식'],
  ['foodAvoid', '못 먹는 음식'],
  ['activityWant', '하고 싶은 활동'],
  ['activityAvoid', '하기 싫은 활동'],
  ['budget', '1인 기준 예산'],
  ['notes', '특별히 고려했으면 좋을 사항 (알레르기, 반려견 동반, 이동 제약 등)'],
];

const EMPTY_EXTRACTION = {
  preferredFoods: [],
  dislikedFoods: [],
  allergies: [],
  preferredActivities: [],
  activityKeywords: [],
  preferredAtmospheres: [],
  budget: null,
  mustHave: [],
  mustAvoid: [],
};

/**
 * 설문 형식 인터뷰. 질문마다 왕복하지 않고 한 번에 답변을 받아 Gemini도 한 번만 부른다.
 * 전부 무응답이어도 제출할 수 있다 — 그 경우 취향 없이(중립) 코스 생성에 반영된다.
 */
export async function submitSurveyAnswers(
  interviewId: string,
  userId: string,
  answers: Partial<Record<(typeof SURVEY_FIELDS)[number][0], string>>,
) {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { meeting: true, messages: true },
  });
  if (!interview) throw apiError('RESOURCE_NOT_FOUND');
  if (interview.userId !== userId) throw apiError('FORBIDDEN');
  if (interview.status === 'SUBMITTED') throw apiError('ALREADY_PROCESSED', { reason: '이미 제출한 인터뷰입니다.' });
  if (interview.meeting.responseDeadlineAt < new Date()) throw apiError('RESPONSE_DEADLINE_PASSED');

  const answered = SURVEY_FIELDS.filter(([key]) => answers[key]?.trim());
  const history = answered.flatMap(([key, question]) => [
    { role: 'ASSISTANT' as const, content: question },
    { role: 'USER' as const, content: answers[key]!.trim() },
  ]);

  // 전부 무응답이면 Gemini를 부를 필요도 없다 — 중립 취향으로 바로 저장한다.
  const rawExtraction = history.length > 0 ? await getAiProvider().extractPreferences(history) : EMPTY_EXTRACTION;
  const extracted = extractedPreferenceSchema.parse(rawExtraction);

  const updated = await prisma.$transaction(async (tx: PrismaTx) => {
    if (answered.length > 0) {
      const baseTurn = interview.messages.length;
      const rows = answered.flatMap(([key, question], i) => [
        { interviewId, role: 'ASSISTANT' as const, content: question, turn: baseTurn + i * 2 },
        { interviewId, role: 'USER' as const, content: answers[key]!.trim(), turn: baseTurn + i * 2 + 1 },
      ]);
      // 답변마다 순차로 create()하면 매번 DB 왕복이 생겨 pgbouncer 지연에서 트랜잭션
      // 기본 제한시간(5초)을 넘기기 쉽다 — createMany로 한 번에 묶어서 쓴다.
      await tx.interviewMessage.createMany({ data: rows });
    }

    await tx.extractedPreference.upsert({
      where: { interviewId },
      create: {
        interviewId,
        preferredFoods: extracted.preferredFoods,
        dislikedFoods: extracted.dislikedFoods,
        allergies: extracted.allergies,
        preferredActivities: extracted.preferredActivities,
        activityKeywords: extracted.activityKeywords,
        preferredAtmospheres: extracted.preferredAtmospheres,
        budgetMin: extracted.budget?.min ?? null,
        budgetMax: extracted.budget?.max ?? null,
        budgetCurrency: extracted.budget?.currency ?? 'KRW',
        mustHave: extracted.mustHave,
        mustAvoid: extracted.mustAvoid,
      },
      update: {
        preferredFoods: extracted.preferredFoods,
        dislikedFoods: extracted.dislikedFoods,
        allergies: extracted.allergies,
        preferredActivities: extracted.preferredActivities,
        activityKeywords: extracted.activityKeywords,
        preferredAtmospheres: extracted.preferredAtmospheres,
        budgetMin: extracted.budget?.min ?? null,
        budgetMax: extracted.budget?.max ?? null,
        mustHave: extracted.mustHave,
        mustAvoid: extracted.mustAvoid,
      },
    });

    return tx.aiInterview.update({
      where: { id: interviewId },
      data: { status: 'READY_TO_SUBMIT', currentQuestion: interview.targetQuestionCount, turnCount: { increment: 1 } },
      include: { messages: { orderBy: { turn: 'asc' } }, extracted: true },
    });
  });

  return serializeInterview(updated);
}

export async function updateExtractedPreference(interviewId: string, userId: string, input: unknown) {
  const interview = await prisma.aiInterview.findUnique({ where: { id: interviewId } });
  if (!interview) throw apiError('RESOURCE_NOT_FOUND');
  if (interview.userId !== userId) throw apiError('FORBIDDEN');
  if (interview.status === 'SUBMITTED') throw apiError('ALREADY_PROCESSED');

  const parsed = extractedPreferenceSchema.parse(input);
  const saved = await prisma.extractedPreference.upsert({
    where: { interviewId },
    create: {
      interviewId,
      preferredFoods: parsed.preferredFoods,
      dislikedFoods: parsed.dislikedFoods,
      allergies: parsed.allergies,
      preferredActivities: parsed.preferredActivities,
      activityKeywords: parsed.activityKeywords,
      preferredAtmospheres: parsed.preferredAtmospheres,
      budgetMin: parsed.budget?.min ?? null,
      budgetMax: parsed.budget?.max ?? null,
      budgetCurrency: parsed.budget?.currency ?? 'KRW',
      mustHave: parsed.mustHave,
      mustAvoid: parsed.mustAvoid,
      editedByUser: true,
    },
    update: {
      preferredFoods: parsed.preferredFoods,
      dislikedFoods: parsed.dislikedFoods,
      allergies: parsed.allergies,
      preferredActivities: parsed.preferredActivities,
      activityKeywords: parsed.activityKeywords,
      preferredAtmospheres: parsed.preferredAtmospheres,
      budgetMin: parsed.budget?.min ?? null,
      budgetMax: parsed.budget?.max ?? null,
      mustHave: parsed.mustHave,
      mustAvoid: parsed.mustAvoid,
      editedByUser: true,
    },
  });
  return serializeExtracted(saved);
}

export async function submitInterview(interviewId: string, userId: string) {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { extracted: true, meeting: true },
  });
  if (!interview) throw apiError('RESOURCE_NOT_FOUND');
  if (interview.userId !== userId) throw apiError('FORBIDDEN');
  if (interview.meeting.responseDeadlineAt < new Date()) throw apiError('RESPONSE_DEADLINE_PASSED');
  if (interview.status === 'SUBMITTED') return { interviewId, alreadySubmitted: true };
  if (!interview.extracted) throw apiError('INTERVIEW_INCOMPLETE');

  await prisma.$transaction(async (tx: PrismaTx) => {
    await tx.aiInterview.update({
      where: { id: interviewId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    await tx.participant.update({
      where: { meetingId_userId: { meetingId: interview.meetingId, userId } },
      data: { status: 'INTERVIEW_COMPLETED' },
    });
  });

  return { interviewId, alreadySubmitted: false, submittedAt: new Date().toISOString() };
}

/** 코스 생성 전이라면 다시 열어 수정할 수 있다. */
export async function reopenInterview(interviewId: string, userId: string) {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { meeting: { include: { courses: true } } },
  });
  if (!interview) throw apiError('RESOURCE_NOT_FOUND');
  if (interview.userId !== userId) throw apiError('FORBIDDEN');
  if (interview.meeting.courses.length > 0) throw apiError('INVALID_MEETING_STATUS');

  await prisma.$transaction(async (tx: PrismaTx) => {
    await tx.aiInterview.update({
      where: { id: interviewId },
      data: { status: 'READY_TO_SUBMIT', submittedAt: null },
    });
    await tx.participant.update({
      where: { meetingId_userId: { meetingId: interview.meetingId, userId } },
      data: { status: 'INTERVIEW_IN_PROGRESS' },
    });
  });
  return { interviewId, reopened: true };
}

/** 방장·참여자가 볼 수 있는 유일한 정보. 원문은 절대 포함하지 않는다. */
export async function getResponseStatus(meetingId: string, userId: string) {
  const participant = await prisma.participant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant) throw apiError('FORBIDDEN');

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: {
      participants: { include: { user: { select: { nickname: true, profileImageUrl: true } } } },
    },
  });

  return {
    meetingId,
    responseDeadlineAt: meeting.responseDeadlineAt.toISOString(),
    serverTime: new Date().toISOString(),
    submittedCount: meeting.participants.filter((p: PrismaRow) => p.status === 'INTERVIEW_COMPLETED').length,
    totalCount: meeting.participants.filter((p: PrismaRow) => p.status !== 'DECLINED').length,
    participants: meeting.participants.map((p: PrismaRow) => ({
      userId: p.userId,
      nickname: p.user.nickname,
      profileImageUrl: p.user.profileImageUrl,
      status: p.status,
    })),
  };
}

// ── 직렬화 ──────────────────────────────────────────────────────────

function serializeExtracted(extracted: PrismaRow) {
  if (!extracted) return null;
  return {
    preferredFoods: extracted.preferredFoods,
    dislikedFoods: extracted.dislikedFoods,
    allergies: extracted.allergies,
    preferredActivities: extracted.preferredActivities,
    activityKeywords: extracted.activityKeywords,
    preferredAtmospheres: extracted.preferredAtmospheres,
    budget:
      extracted.budgetMin !== null && extracted.budgetMax !== null
        ? { min: extracted.budgetMin, max: extracted.budgetMax, currency: extracted.budgetCurrency }
        : null,
    mustHave: extracted.mustHave,
    mustAvoid: extracted.mustAvoid,
    editedByUser: extracted.editedByUser,
  };
}

function serializeInterview(interview: PrismaRow) {
  return {
    interviewId: interview.id,
    meetingId: interview.meetingId,
    status: interview.status,
    currentQuestion: interview.currentQuestion,
    targetQuestionCount: interview.targetQuestionCount,
    maxTurns: interviewPolicy.maxTurns,
    defaultPreferencesLoaded: interview.defaultPreferencesLoaded,
    messages: (interview.messages ?? []).map((m: PrismaRow) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      turn: m.turn,
      createdAt: m.createdAt.toISOString(),
    })),
    extracted: serializeExtracted(interview.extracted),
  };
}
