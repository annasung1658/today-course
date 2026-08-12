import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/errors';
import { hours, invitationPolicy, defaultResponseDeadline } from '@oneulcourse/core';
import { notify } from '@/server/notification-service';
import type { z } from 'zod';
import type { createMeetingSchema } from '@/server/schemas';
import type { PrismaRow, PrismaTx } from '@/server/prisma-types';
import { canScheduleMeeting, meetingRecordWindow } from '@/lib/meeting-lifecycle';
import { finalizeCourse } from '@/server/course-service';

/** 약속 생성·조회·초대. */

export async function createMeeting(userId: string, input: z.infer<typeof createMeetingSchema>) {
  const now = new Date();
  if (!canScheduleMeeting(input.scheduledStartAt, now)) {
    throw apiError('VALIDATION_ERROR', { scheduledStartAt: '오늘 이전 날짜로는 약속을 만들 수 없습니다.' });
  }
  const responseDeadlineAt = input.responseDeadlineAt ?? defaultResponseDeadline(now);

  const meeting = await prisma.$transaction(async (tx: PrismaTx) => {
    const created = await tx.meeting.create({
      data: {
        hostUserId: userId,
        title: input.title,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        areaName: input.area.name,
        areaAddress: input.area.address,
        areaLatitude: input.area.latitude,
        areaLongitude: input.area.longitude,
        capacity: input.capacity,
        relationshipTags: input.relationshipTags,
        relationshipDescription: input.relationshipDescription,
        atmosphereTags: input.atmosphereTags,
        atmosphereDescription: input.atmosphereDescription,
        specialNotes: input.specialNotes,
        responseDeadlineAt,
        status: 'INVITING',
        fixedSchedules: {
          create: input.fixedSchedules.map((f) => ({
            title: f.title,
            startAt: f.startAt,
            endAt: f.endAt,
            placeName: f.placeName,
            address: f.address,
            placeId: f.placeId,
            latitude: f.latitude,
            longitude: f.longitude,
            category: f.category,
            locked: true,
          })),
        },
        // 방장도 참여자다.
        participants: { create: { userId, role: 'HOST', status: 'JOINED' } },
      },
      include: { fixedSchedules: true },
    });

    // 응답 마감 시각에 실행할 작업을 예약한다.
    await tx.aiJob.create({
      data: {
        meetingId: created.id,
        type: 'CLOSE_RESPONSES',
        status: 'QUEUED',
        scheduledAt: responseDeadlineAt,
      },
    });

    return created;
  });

  return meeting;
}

export interface MeetingDetail {
  id: string;
  title: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  area: { name: string; address: string | null; latitude: number | null; longitude: number | null };
  capacity: number;
  relationshipTags: string[];
  relationshipDescription: string | null;
  atmosphereTags: string[];
  atmosphereDescription: string | null;
  specialNotes: string | null;
  responseDeadlineAt: string;
  status: string;
  isHost: boolean;
  host: { id: string; nickname: string; profileImageUrl: string | null };
  fixedSchedules: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    placeName: string;
    address: string | null;
    category: string;
    locked: boolean;
  }>;
  participants: Array<{
    participantId: string;
    userId: string;
    nickname: string;
    profileImageUrl: string | null;
    role: string;
    status: string;
    isMe: boolean;
  }>;
  currentCourse: { courseId: string; status: string; votingEndsAt: string } | null;
  serverTime: string;
  recordAccess: { available: boolean; writable: boolean; opensAt: string; closesAt: string };
}

async function finalizeExpiredCourseOnRead(meeting: PrismaRow) {
  const course = meeting.courses?.[0];
  if (meeting.status !== 'VOTING' || !course || course.status !== 'VOTING' || course.votingEndsAt.getTime() > Date.now()) return;
  try {
    const result = await finalizeCourse(course.id);
    if (('confirmed' in result && result.confirmed) || ('alreadyConfirmed' in result && result.alreadyConfirmed)) {
      meeting.status = 'CONFIRMED';
      course.status = 'CONFIRMED';
    }
  } catch {
    // 크론이 다시 처리할 수 있도록 조회 자체는 실패시키지 않는다.
  }
}

export async function getMeetingDetail(meetingId: string, userId: string): Promise<MeetingDetail> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      fixedSchedules: { orderBy: { startAt: 'asc' } },
      host: { select: { id: true, nickname: true, profileImageUrl: true } },
      participants: {
        include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      courses: { orderBy: { version: 'desc' }, take: 1, select: { id: true, status: true, votingEndsAt: true } },
    },
  });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');

  await finalizeExpiredCourseOnRead(meeting);

  const me = meeting.participants.find((p: PrismaRow) => p.userId === userId);
  if (!me) throw apiError('FORBIDDEN');

  const recordWindow = meetingRecordWindow(meeting.scheduledStartAt);
  const effectiveStatus = meeting.status !== 'CANCELLED' && recordWindow.isPast ? 'COMPLETED' : meeting.status;

  return {
    id: meeting.id,
    title: meeting.title,
    scheduledStartAt: meeting.scheduledStartAt.toISOString(),
    scheduledEndAt: meeting.scheduledEndAt.toISOString(),
    area: {
      name: meeting.areaName,
      address: meeting.areaAddress,
      latitude: meeting.areaLatitude,
      longitude: meeting.areaLongitude,
    },
    capacity: meeting.capacity,
    relationshipTags: meeting.relationshipTags,
    relationshipDescription: meeting.relationshipDescription,
    atmosphereTags: meeting.atmosphereTags,
    atmosphereDescription: meeting.atmosphereDescription,
    specialNotes: meeting.specialNotes,
    responseDeadlineAt: meeting.responseDeadlineAt.toISOString(),
    status: effectiveStatus,
    isHost: meeting.hostUserId === userId,
    host: meeting.host,
    fixedSchedules: meeting.fixedSchedules.map((f: PrismaRow) => ({
      id: f.id,
      title: f.title,
      startAt: f.startAt.toISOString(),
      endAt: f.endAt.toISOString(),
      placeName: f.placeName,
      address: f.address,
      category: f.category,
      locked: f.locked,
    })),
    // 다른 참여자에게는 제출 여부만 보인다. 인터뷰 원문은 절대 포함하지 않는다.
    participants: meeting.participants.map((p: PrismaRow) => ({
      participantId: p.id,
      userId: p.userId,
      nickname: p.user.nickname,
      profileImageUrl: p.user.profileImageUrl,
      role: p.role,
      status: p.status,
      isMe: p.userId === userId,
    })),
    currentCourse: meeting.courses[0]
      ? {
          courseId: meeting.courses[0].id,
          status: meeting.courses[0].status,
          votingEndsAt: meeting.courses[0].votingEndsAt.toISOString(),
        }
      : null,
    serverTime: new Date().toISOString(),
    recordAccess: {
      available: recordWindow.available,
      writable: recordWindow.writable,
      opensAt: recordWindow.opensAt.toISOString(),
      closesAt: recordWindow.closesAt.toISOString(),
    },
  };
}

export interface MeetingSummary {
  id: string;
  title: string;
  scheduledStartAt: string;
  areaName: string;
  status: string;
  isHost: boolean;
  participantCount: number;
  capacity: number;
  responseDeadlineAt: string;
  myStatus: string | null;
  currentCourse: { courseId: string; status: string; votingEndsAt: string } | null;
}

export async function listMyMeetings(userId: string, status?: string): Promise<MeetingSummary[]> {
  const meetings = await prisma.meeting.findMany({
    where: {
      participants: { some: { userId, status: { not: 'DECLINED' } } },
      ...(status ? { status: status as never } : {}),
    },
    include: {
      participants: { select: { id: true, status: true, userId: true } },
      courses: { orderBy: { version: 'desc' }, take: 1, select: { id: true, status: true, votingEndsAt: true } },
    },
    orderBy: { scheduledStartAt: 'asc' },
  });

  await Promise.all(meetings.map((meeting: PrismaRow) => finalizeExpiredCourseOnRead(meeting)));

  return meetings.map((m: PrismaRow) => ({
    id: m.id,
    title: m.title,
    scheduledStartAt: m.scheduledStartAt.toISOString(),
    areaName: m.areaName,
    status: m.status !== 'CANCELLED' && meetingRecordWindow(m.scheduledStartAt).isPast ? 'COMPLETED' : m.status,
    isHost: m.hostUserId === userId,
    participantCount: m.participants.filter((p: PrismaRow) => p.status !== 'DECLINED').length,
    capacity: m.capacity,
    responseDeadlineAt: m.responseDeadlineAt.toISOString(),
    myStatus: m.participants.find((p: PrismaRow) => p.userId === userId)?.status ?? null,
    currentCourse: m.courses[0]
      ? { courseId: m.courses[0].id, status: m.courses[0].status, votingEndsAt: m.courses[0].votingEndsAt.toISOString() }
      : null,
  }));
}

// ── 초대 ────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, invitationPolicy.inviteCodeLength).toUpperCase();
}

export async function createInvitation(meetingId: string, userId: string, appUrl: string) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw apiError('MEETING_NOT_FOUND');
  if (meeting.hostUserId !== userId) throw apiError('FORBIDDEN', { reason: '방장만 초대 링크를 만들 수 있습니다.' });

  // 초대 유효기간은 약속 시작시간을 넘지 않는다.
  const ttl = new Date(Date.now() + hours(invitationPolicy.defaultTtlHours));
  const expiresAt = ttl < meeting.scheduledStartAt ? ttl : meeting.scheduledStartAt;

  const invitation = await prisma.invitation.create({
    data: { meetingId, createdByUserId: userId, inviteCode: generateInviteCode(), expiresAt, status: 'ACTIVE' },
  });

  return {
    invitationId: invitation.id,
    inviteCode: invitation.inviteCode,
    inviteUrl: `${appUrl}/invite/${invitation.inviteCode}`,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/** 로그인하지 않아도 볼 수 있는 초대장 미리보기. 참여자 명단은 노출하지 않는다. */
export async function previewInvitation(inviteCode: string, userId: string | null) {
  const invitation = await prisma.invitation.findUnique({
    where: { inviteCode },
    include: {
      meeting: {
        include: {
          host: { select: { nickname: true, profileImageUrl: true } },
          participants: { select: { userId: true, status: true } },
        },
      },
    },
  });
  if (!invitation) throw apiError('RESOURCE_NOT_FOUND');

  const expired = invitation.status !== 'ACTIVE' || invitation.expiresAt < new Date();
  const meeting = invitation.meeting;
  const active = meeting.participants.filter((p: PrismaRow) => p.status !== 'DECLINED');

  return {
    inviteCode,
    expired,
    hostNickname: meeting.host.nickname,
    hostProfileImageUrl: meeting.host.profileImageUrl,
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    scheduledStartAt: meeting.scheduledStartAt.toISOString(),
    scheduledEndAt: meeting.scheduledEndAt.toISOString(),
    areaName: meeting.areaName,
    relationshipTags: meeting.relationshipTags,
    atmosphereTags: meeting.atmosphereTags,
    currentParticipantCount: active.length,
    capacity: meeting.capacity,
    requiresLogin: userId === null,
    alreadyJoined: userId !== null && active.some((p: PrismaRow) => p.userId === userId),
    meetingStatus: meeting.status,
  };
}

export async function acceptInvitation(inviteCode: string, userId: string) {
  return prisma.$transaction(async (tx: PrismaTx) => {
    const invitation = await tx.invitation.findUnique({
      where: { inviteCode },
      include: { meeting: { include: { participants: true, host: true } } },
    });
    if (!invitation) throw apiError('RESOURCE_NOT_FOUND');
    if (invitation.status !== 'ACTIVE' || invitation.expiresAt < new Date()) {
      throw apiError('INVITATION_EXPIRED');
    }

    const meeting = invitation.meeting;
    if (meeting.status === 'CANCELLED') throw apiError('INVALID_MEETING_STATUS');
    // 코스 생성이 시작된 뒤에는 새로 합류할 수 없다.
    if (['GENERATING', 'VOTING', 'CONFIRMED', 'COMPLETED'].includes(meeting.status)) {
      throw apiError('INVALID_MEETING_STATUS', { reason: '이미 코스 생성이 시작된 약속입니다.' });
    }

    const existing = meeting.participants.find((p: PrismaRow) => p.userId === userId);
    if (existing && existing.status !== 'DECLINED') {
      return { meetingId: meeting.id, participantId: existing.id, alreadyJoined: true };
    }

    const activeCount = meeting.participants.filter((p: PrismaRow) => p.status !== 'DECLINED').length;
    if (activeCount >= meeting.capacity) throw apiError('CAPACITY_EXCEEDED');

    const participant = existing
      ? await tx.participant.update({ where: { id: existing.id }, data: { status: 'JOINED' } })
      : await tx.participant.create({ data: { meetingId: meeting.id, userId, status: 'JOINED' } });

    if (meeting.status === 'INVITING') {
      await tx.meeting.update({ where: { id: meeting.id }, data: { status: 'COLLECTING_RESPONSES' } });
    }

    return { meetingId: meeting.id, participantId: participant.id, alreadyJoined: false };
  });
}

export async function declineInvitation(inviteCode: string, userId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { inviteCode } });
  if (!invitation) throw apiError('RESOURCE_NOT_FOUND');

  await prisma.participant.upsert({
    where: { meetingId_userId: { meetingId: invitation.meetingId, userId } },
    create: { meetingId: invitation.meetingId, userId, status: 'DECLINED' },
    update: { status: 'DECLINED' },
  });
  return { meetingId: invitation.meetingId, declined: true };
}

export async function inviteNotification(meetingId: string, userId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      host: { select: { nickname: true } },
      invitations: {
        where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { inviteCode: true },
      },
    },
  });
  if (meeting) {
    await notify.invited(
      userId,
      meetingId,
      meeting.title,
      meeting.host.nickname,
      meeting.invitations[0]?.inviteCode,
    );
  }
}
