import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import type { z } from 'zod';
import type { feedbackDraftSchema } from '@/server/schemas';
import type { PrismaRow, PrismaTx } from '@/server/prisma-types';

/**
 * AI 피드백.
 * 제출 후에도 사용자의 장기 기본 설정에 자동 반영하지 않는다.
 * 반영할 만한 취향을 제안만 하고, 사용자가 승인한 항목만 저장한다.
 */

export async function saveDraft(meetingId: string, userId: string, input: z.infer<typeof feedbackDraftSchema>) {
  const participant = await prisma.participant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant) throw apiError('FORBIDDEN');

  return prisma.$transaction(async (tx: PrismaTx) => {
    const feedback = await tx.feedback.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: { meetingId, userId, rating: input.rating, content: input.content, status: 'DRAFT' },
      update: { rating: input.rating, content: input.content },
    });

    for (const item of input.courseItemFeedbacks) {
      await tx.feedbackItem.upsert({
        where: { feedbackId_courseItemId: { feedbackId: feedback.id, courseItemId: item.courseItemId } },
        create: {
          feedbackId: feedback.id,
          courseItemId: item.courseItemId,
          rating: item.rating,
          reasonCodes: item.reasonCodes,
          wouldRevisit: item.wouldRevisit,
        },
        update: { rating: item.rating, reasonCodes: item.reasonCodes, wouldRevisit: item.wouldRevisit },
      });
    }

    return tx.feedback.findUniqueOrThrow({ where: { id: feedback.id }, include: { items: true } });
  });
}

export async function getDraft(meetingId: string, userId: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    include: { items: true },
  });
  if (!feedback) return null;
  return {
    id: feedback.id,
    rating: feedback.rating,
    content: feedback.content,
    status: feedback.status,
    courseItemFeedbacks: feedback.items.map((i: PrismaRow) => ({
      courseItemId: i.courseItemId,
      rating: i.rating,
      reasonCodes: i.reasonCodes,
      wouldRevisit: i.wouldRevisit,
    })),
    suggestedPreferenceUpdates: feedback.suggestedPreferenceUpdates,
  };
}

export async function submitFeedback(meetingId: string, userId: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    include: { items: { include: { courseItem: true } } },
  });
  if (!feedback) throw apiError('RESOURCE_NOT_FOUND');
  if (feedback.status === 'SUBMITTED') return { feedbackId: feedback.id, alreadySubmitted: true };

  // 반영 제안만 만든다. 자동 저장하지 않는다.
  const suggestions: Array<{ field: string; value: string; label: string }> = [];
  for (const item of feedback.items) {
    if (item.reasonCodes.includes('TOO_EXPENSIVE')) {
      suggestions.push({ field: 'mustAvoid', value: 'HIGH_PRICE', label: '비싼 곳은 피하기' });
    }
    if (item.reasonCodes.includes('TOO_MUCH_WALKING')) {
      suggestions.push({ field: 'mustAvoid', value: 'LONG_WALK', label: '많이 걷는 코스는 피하기' });
    }
    if (item.reasonCodes.includes('TOO_CROWDED')) {
      suggestions.push({ field: 'mustAvoid', value: 'CROWDED', label: '붐비는 곳은 피하기' });
    }
  }

  const updated = await prisma.feedback.update({
    where: { id: feedback.id },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      suggestedPreferenceUpdates: suggestions.length > 0 ? suggestions : undefined,
    },
  });

  return {
    feedbackId: updated.id,
    alreadySubmitted: false,
    message: '감사합니다.\n의견을 다음 AI 코스 추천에 반영할게요.',
    suggestedPreferenceUpdates: suggestions,
  };
}

/** 사용자가 승인한 제안만 기본 설정에 더한다. */
export async function applyPreferenceUpdates(
  feedbackId: string,
  userId: string,
  approved: Array<{ field: string; value: string }>,
) {
  const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw apiError('RESOURCE_NOT_FOUND');
  if (feedback.userId !== userId) throw apiError('FORBIDDEN');

  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const mustAvoid = new Set(pref?.mustAvoid ?? []);
  const mustHave = new Set(pref?.mustHave ?? []);

  for (const update of approved) {
    if (update.field === 'mustAvoid') mustAvoid.add(update.value);
    if (update.field === 'mustHave') mustHave.add(update.value);
  }

  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, mustAvoid: [...mustAvoid], mustHave: [...mustHave] },
    update: { mustAvoid: [...mustAvoid], mustHave: [...mustHave] },
  });

  await prisma.feedback.update({ where: { id: feedbackId }, data: { appliedToPreferenceAt: new Date() } });
  return { applied: approved.length };
}
