import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { notify } from '@/server/notification-service';
import type { PrismaRow } from '@/server/prisma-types';
import { meetingRecordWindow } from '@/server/meeting-service';

/** 약속 후 기록. 작성자와 방장 권한을 구분한다. */

async function assertParticipant(meetingId: string, userId: string) {
  const participant = await prisma.participant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant || participant.status === 'DECLINED') throw apiError('FORBIDDEN');
  return participant;
}

async function assertRecordAccess(meetingId: string, userId: string, requireWrite = false) {
  await assertParticipant(meetingId, userId);
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { scheduledStartAt: true } });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  const window = meetingRecordWindow(meeting.scheduledStartAt);
  if (!window.available) throw apiError('INVALID_MEETING_STATUS', { reason: '약속 당일부터 기록을 열 수 있어요.' });
  if (requireWrite && !window.writable) {
    throw apiError('INVALID_MEETING_STATUS', { reason: '기록 작성 기간이 끝났어요. 기존 기록은 계속 볼 수 있어요.' });
  }
  return window;
}

export async function getOrCreateRecord(meetingId: string, userId: string) {
  await assertRecordAccess(meetingId, userId);
  const existing = await prisma.meetingRecord.findUnique({ where: { meetingId } });
  if (existing) return existing;
  return prisma.meetingRecord.create({ data: { meetingId } });
}

export async function getRecordDetail(meetingId: string, userId: string) {
  const access = await assertRecordAccess(meetingId, userId);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId }, select: { title: true, scheduledStartAt: true, hostUserId: true },
  });

  const record = await prisma.meetingRecord.findUnique({
    where: { meetingId },
    include: {
      photos: { include: { author: { select: { id: true, nickname: true } } }, orderBy: { createdAt: 'asc' } },
      posts: {
        where: { deletedAt: null },
        include: {
          author: { select: { id: true, nickname: true, profileImageUrl: true } },
          comments: {
            where: { deletedAt: null },
            include: { author: { select: { id: true, nickname: true, profileImageUrl: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const course = await prisma.course.findFirst({
    where: { meetingId, status: 'CONFIRMED' },
    include: { items: { where: { status: { not: 'REPLACED' } }, orderBy: { sequence: 'asc' } } },
  });

  return {
    meetingId,
    title: meeting.title,
    scheduledStartAt: meeting.scheduledStartAt.toISOString(),
    writable: access.writable,
    closesAt: access.closesAt.toISOString(),
    recordId: record?.id ?? null,
    courseItems: (course?.items ?? []).map((item: PrismaRow) => ({
      id: item.id,
      sequence: item.sequence,
      title: item.title,
      placeName: item.placeName,
      photos: (record?.photos ?? [])
        .filter((p: PrismaRow) => p.courseItemId === item.id)
        .map((p: PrismaRow) => ({ id: p.id, fileUrl: p.fileUrl, caption: p.caption, author: p.author, createdAt: p.createdAt.toISOString() })),
      posts: (record?.posts ?? [])
        .filter((p: PrismaRow) => p.courseItemId === item.id)
        .map(serializePost),
    })),
    generalPosts: (record?.posts ?? []).filter((p: PrismaRow) => p.courseItemId === null).map(serializePost),
    photos: (record?.photos ?? []).map((p: PrismaRow) => ({
      id: p.id, fileUrl: p.fileUrl, caption: p.caption, author: p.author, createdAt: p.createdAt.toISOString(),
    })),
  };
}

const serializePost = (p: PrismaRow) => ({
  id: p.id,
  content: p.content,
  author: p.author,
  createdAt: p.createdAt.toISOString(),
  comments: p.comments.map((c: PrismaRow) => ({
    id: c.id,
    content: c.content,
    author: c.author,
    createdAt: c.createdAt.toISOString(),
  })),
});

export async function addPhoto(
  recordId: string,
  userId: string,
  input: { courseItemId: string | null; fileUrl: string; storageKey?: string; caption: string | null },
) {
  const record = await prisma.meetingRecord.findUniqueOrThrow({ where: { id: recordId } });
  await assertRecordAccess(record.meetingId, userId, true);
  return prisma.recordPhoto.create({
    data: {
      recordId,
      courseItemId: input.courseItemId,
      authorUserId: userId,
      fileUrl: input.fileUrl,
      storageKey: input.storageKey,
      caption: input.caption,
    },
  });
}

export async function addPost(
  recordId: string,
  userId: string,
  input: { courseItemId: string | null; content: string },
) {
  const record = await prisma.meetingRecord.findUniqueOrThrow({ where: { id: recordId } });
  await assertRecordAccess(record.meetingId, userId, true);
  return prisma.recordPost.create({
    data: { recordId, courseItemId: input.courseItemId, authorUserId: userId, content: input.content },
  });
}

/** 글은 작성자만 수정할 수 있고, 삭제는 작성자 또는 방장이 할 수 있다. */
export async function removePost(postId: string, userId: string) {
  const post = await prisma.recordPost.findUnique({
    where: { id: postId },
    include: { record: { include: { meeting: { select: { hostUserId: true } } } } },
  });
  if (!post) throw apiError('RESOURCE_NOT_FOUND');
  const isAuthor = post.authorUserId === userId;
  const isHost = post.record.meeting.hostUserId === userId;
  if (!isAuthor && !isHost) throw apiError('FORBIDDEN');

  await prisma.recordPost.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  return { id: postId, deleted: true };
}

export async function editPost(postId: string, userId: string, content: string) {
  const post = await prisma.recordPost.findUnique({ where: { id: postId } });
  if (!post) throw apiError('RESOURCE_NOT_FOUND');
  if (post.authorUserId !== userId) throw apiError('FORBIDDEN', { reason: '작성자만 수정할 수 있습니다.' });
  return prisma.recordPost.update({ where: { id: postId }, data: { content } });
}

export async function addComment(postId: string, userId: string, content: string, nickname: string) {
  const post = await prisma.recordPost.findUnique({
    where: { id: postId },
    include: { record: true },
  });
  if (!post) throw apiError('RESOURCE_NOT_FOUND');
  await assertRecordAccess(post.record.meetingId, userId, true);

  const comment = await prisma.recordComment.create({
    data: { postId, authorUserId: userId, content },
  });
  await notify.commentAdded(post.record.meetingId, nickname);
  return comment;
}

/** 월별 캘린더. 확정된 약속만 보여준다. */
export async function getCalendar(userId: string, year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const meetings = await prisma.meeting.findMany({
    where: {
      participants: { some: { userId, status: { not: 'DECLINED' } } },
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      scheduledStartAt: { gte: from, lt: to },
    },
    include: { record: { include: { photos: { take: 1 } } } },
    orderBy: { scheduledStartAt: 'asc' },
  });

  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const meeting of meetings) {
    const key = meeting.scheduledStartAt.toISOString().slice(0, 10);
    const list = grouped.get(key) ?? [];
    list.push({
      recordId: meeting.record?.id ?? null,
      meetingId: meeting.id,
      title: meeting.title,
      thumbnailUrl: meeting.record?.photos[0]?.fileUrl ?? null,
    });
    grouped.set(key, list);
  }

  return {
    year,
    month,
    dates: [...grouped.entries()].map(([date, records]) => ({ date, recordCount: records.length, records })),
  };
}
