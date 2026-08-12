import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';

export interface SharedCourseSummary {
  courseId: string;
  title: string;
  summary: string;
  meetingTitle: string;
  areaName: string;
  items: Array<{
    id: string;
    sequence: number;
    placeName: string;
    reason: string;
  }>;
}

/** 확정된 코스의 공유용 최소 정보만 공개한다. 참여자·투표·취향 정보는 포함하지 않는다. */
export async function getSharedCourseSummary(courseId: string): Promise<SharedCourseSummary> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      status: true,
      title: true,
      summary: true,
      meeting: { select: { title: true, areaName: true, status: true } },
      items: {
        where: { status: { not: 'REPLACED' } },
        orderBy: { sequence: 'asc' },
        select: { id: true, sequence: true, placeName: true, reason: true },
      },
    },
  });

  if (!course || course.status !== 'CONFIRMED' || course.meeting.status === 'CANCELLED') {
    throw apiError('RESOURCE_NOT_FOUND');
  }

  return {
    courseId: course.id,
    title: course.title,
    summary: course.summary,
    meetingTitle: course.meeting.title,
    areaName: course.meeting.areaName,
    items: course.items,
  };
}
