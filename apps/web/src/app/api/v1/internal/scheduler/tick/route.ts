import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { internalRoute } from '@/lib/api/handler';
import { closeResponsesAndQueueGeneration, finalizeCourse } from '@/server/course-service';
import { notify } from '@/server/notification-service';
import { responsePolicy } from '@oneulcourse/core';

/**
 * 스케줄러 진입점. Vercel Cron이 1분마다 호출한다.
 * 서버 시간을 기준으로 마감된 작업만 골라 처리하므로,
 * 크론 주기가 조금 늦어도 판정 자체는 정확하다.
 */
export const POST = internalRoute(async () => {
  const now = new Date();
  const processed = { closedResponses: 0, finalizedCourses: 0, reminders: 0, failures: [] as string[] };

  // 1) 응답 마감
  const closeJobs = await prisma.aiJob.findMany({
    where: { type: 'CLOSE_RESPONSES', status: 'QUEUED', scheduledAt: { lte: now } },
    take: 20,
  });
  for (const job of closeJobs) {
    try {
      await prisma.aiJob.update({ where: { id: job.id }, data: { status: 'RUNNING', startedAt: now } });
      await closeResponsesAndQueueGeneration(job.meetingId);
      await prisma.aiJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', finishedAt: new Date() } });
      processed.closedResponses += 1;
    } catch (error) {
      await prisma.aiJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: String(error) },
      });
      processed.failures.push(`close:${job.meetingId}`);
    }
  }

  // 2) 투표 자동 확정 (서버 시간 기준, votingEndsAt 하나만 본다)
  const finalizeJobs = await prisma.aiJob.findMany({
    where: { type: 'FINALIZE_COURSE', status: 'QUEUED', scheduledAt: { lte: now } },
    take: 20,
  });
  for (const job of finalizeJobs) {
    const courseId = (job.payload as { courseId?: string } | null)?.courseId;
    if (!courseId) continue;
    try {
      const result = await finalizeCourse(courseId);
      if ('confirmed' in result && result.confirmed) {
        await prisma.aiJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', finishedAt: new Date() } });
        processed.finalizedCourses += 1;
      }
      // WAIT이면 QUEUED로 두고 다음 tick에서 다시 시도한다.
    } catch (error) {
      processed.failures.push(`finalize:${courseId}:${String(error)}`);
    }
  }

  // 3) 응답 마감 리마인더
  for (const minutesBefore of responsePolicy.reminderMinutesBefore) {
    const windowStart = new Date(now.getTime() + minutesBefore * 60_000 - 60_000);
    const windowEnd = new Date(now.getTime() + minutesBefore * 60_000);
    const meetings = await prisma.meeting.findMany({
      where: {
        status: { in: ['INVITING', 'COLLECTING_RESPONSES'] },
        responseDeadlineAt: { gt: windowStart, lte: windowEnd },
      },
      include: { participants: { where: { status: { notIn: ['INTERVIEW_COMPLETED', 'DECLINED'] } } } },
    });
    for (const meeting of meetings) {
      const userIds = meeting.participants.map((p: { userId: string }) => p.userId);
      if (userIds.length === 0) continue;
      await notify.interviewReminder(meeting.id, userIds, minutesBefore);
      processed.reminders += 1;
    }
  }

  return { ranAt: now.toISOString(), ...processed };
}, env.CRON_SECRET);
