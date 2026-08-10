/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { calcItemRevoteEndsAt, calcVotingEndsAt } from '@oneulcourse/core';

/**
 * 개발용 시드 데이터.
 *
 * 만들어지는 상황: 성수동 토요일 모임에 4명이 참여했고, 모두 취향을 제출했으며,
 * 코스가 생성되어 60분 투표가 진행 중이다. 저녁식사 항목은 4명 중 3명이 싫어요를
 * 눌러 이미 한 번 교체되었고, 교체된 새 항목만 10분짜리 재투표 창을 갖고 있다.
 *
 * 이 상태로 로그인하면 두 개의 타이머가 동시에 도는 화면을 바로 볼 수 있다.
 */

const prisma = new PrismaClient() as any;

const MINUTE = 60_000;

async function main() {
  console.info('시드 데이터를 넣는 중...');

  // 기존 데이터 정리 (개발 환경 전용)
  await prisma.$transaction([
    prisma.recordComment.deleteMany(),
    prisma.recordPost.deleteMany(),
    prisma.recordPhoto.deleteMany(),
    prisma.meetingRecord.deleteMany(),
    prisma.feedbackItem.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.courseVote.deleteMany(),
    prisma.aiJob.deleteMany(),
    prisma.courseItem.deleteMany(),
    prisma.course.deleteMany(),
    prisma.rejectedPlace.deleteMany(),
    prisma.interviewMessage.deleteMany(),
    prisma.extractedPreference.deleteMany(),
    prisma.aiInterview.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.participant.deleteMany(),
    prisma.fixedSchedule.deleteMany(),
    prisma.meeting.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.idempotencyRecord.deleteMany(),
    prisma.notificationSetting.deleteMany(),
    prisma.userPreference.deleteMany(),
    prisma.account.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash('password1234', 10);

  const people = [
    { email: 'jiwon@example.com', nickname: '지원', allergies: ['PEANUT'], mustHave: [] as string[] },
    { email: 'minseo@example.com', nickname: '민서', allergies: [] as string[], mustHave: ['PET_FRIENDLY'] },
    { email: 'hyunwoo@example.com', nickname: '현우', allergies: [] as string[], mustHave: [] as string[] },
    { email: 'yerin@example.com', nickname: '예린', allergies: [] as string[], mustHave: [] as string[] },
  ];

  const users = [];
  for (const person of people) {
    users.push(
      await prisma.user.create({
        data: {
          email: person.email,
          passwordHash,
          nickname: person.nickname,
          authProvider: 'EMAIL',
          notificationSetting: { create: {} },
          preference: {
            create: {
              preferredFoods: ['KOREAN', 'JAPANESE'],
              dislikedFoods: [],
              allergies: person.allergies,
              preferredActivities: ['WALK', 'CAFE'],
              preferredAtmospheres: ['CASUAL'],
              budgetMin: 20000,
              budgetMax: 45000,
              mustHave: person.mustHave,
              mustAvoid: [],
            },
          },
        },
      }),
    );
  }

  const [host, minseo, hyunwoo, yerin] = users;

  // 토요일 저녁 성수동 모임
  const meetingStart = new Date();
  meetingStart.setDate(meetingStart.getDate() + 3);
  meetingStart.setHours(16, 0, 0, 0);
  const meetingEnd = new Date(meetingStart.getTime() + 6 * 60 * MINUTE);

  const meeting = await prisma.meeting.create({
    data: {
      hostUserId: host.id,
      title: '토요일 성수 모임',
      scheduledStartAt: meetingStart,
      scheduledEndAt: meetingEnd,
      areaName: '성수동',
      areaAddress: '서울특별시 성동구 성수동',
      areaLatitude: 37.5445,
      areaLongitude: 127.0557,
      capacity: 6,
      relationshipTags: ['FRIENDS'],
      atmosphereTags: ['CASUAL', 'TRENDY'],
      specialNotes: '민서가 강아지를 데려와요. 지원이는 땅콩 알레르기가 있어요.',
      responseDeadlineAt: new Date(Date.now() - 30 * MINUTE),
      responsesClosedAt: new Date(Date.now() - 30 * MINUTE),
      status: 'VOTING',
      participants: {
        create: [
          { userId: host.id, role: 'HOST', status: 'INTERVIEW_COMPLETED' },
          { userId: minseo.id, status: 'INTERVIEW_COMPLETED' },
          { userId: hyunwoo.id, status: 'INTERVIEW_COMPLETED' },
          { userId: yerin.id, status: 'INTERVIEW_COMPLETED' },
        ],
      },
    },
  });

  // 각자 제출한 취향
  const interviewData = [
    { user: host, text: '일식이랑 한식 좋아해요. 땅콩 알레르기가 있어서 꼭 피해야 해요.', allergies: ['PEANUT'], mustHave: [] as string[] },
    { user: minseo, text: '강아지를 데려갈 거라서 반려견 동반 가능한 곳이면 좋겠어요.', allergies: [] as string[], mustHave: ['PET_FRIENDLY'] },
    { user: hyunwoo, text: '산책하고 카페 가는 거 좋아해요. 1인당 3만원 정도 생각해요.', allergies: [] as string[], mustHave: [] as string[] },
    { user: yerin, text: '조용한 곳이 좋아요. 웨이팅 긴 곳은 피하고 싶어요.', allergies: [] as string[], mustHave: [] as string[] },
  ];

  for (const entry of interviewData) {
    await prisma.aiInterview.create({
      data: {
        meetingId: meeting.id,
        userId: entry.user.id,
        status: 'SUBMITTED',
        currentQuestion: 4,
        turnCount: 4,
        submittedAt: new Date(Date.now() - 45 * MINUTE),
        messages: {
          create: [
            { role: 'ASSISTANT', content: '이번 모임에서 먹고 싶은 음식과 피하고 싶은 음식을 알려주세요.', turn: 0 },
            { role: 'USER', content: entry.text, turn: 1 },
          ],
        },
        extracted: {
          create: {
            preferredFoods: ['JAPANESE', 'KOREAN'],
            dislikedFoods: [],
            allergies: entry.allergies,
            preferredActivities: ['WALK', 'CAFE'],
            preferredAtmospheres: ['CASUAL'],
            budgetMin: 20000,
            budgetMax: 40000,
            mustHave: entry.mustHave,
            mustAvoid: entry.user.id === yerin.id ? ['LONG_WAIT'] : [],
          },
        },
      },
    });
  }

  // 코스는 20분 전에 생성됨 → 60분 창 중 40분 남음
  const votingStartedAt = new Date(Date.now() - 20 * MINUTE);
  const votingEndsAt = calcVotingEndsAt(votingStartedAt);

  const course = await prisma.course.create({
    data: {
      meetingId: meeting.id,
      version: 1,
      status: 'VOTING',
      title: '성수동 편안한 코스',
      summary: '성수동에서 네 곳을 도는 6시간 코스예요. 반려견 동반이 가능하고 땅콩을 쓰지 않는 곳으로 골랐어요.',
      estimatedBudgetPerPerson: 62500,
      votingStartedAt,
      votingEndsAt,
      eligibleParticipantCount: 4,
    },
  });

  const at = (offsetMinutes: number) => new Date(meetingStart.getTime() + offsetMinutes * MINUTE);

  const cafe = await prisma.courseItem.create({
    data: {
      courseId: course.id,
      sequence: 1,
      category: 'CAFE',
      title: '카페 - 어니언 성수',
      placeId: 'place_cafe_onion',
      placeName: '어니언 성수',
      address: '서울특별시 성동구 성수동2가',
      latitude: 37.5445,
      longitude: 127.0557,
      petFriendly: true,
      startAt: at(0),
      endAt: at(60),
      estimatedPricePerPerson: 9000,
      reason: '반려견과 함께 들어갈 수 있고, 예산 안에 들어와요.',
      travelMinutesFromPrev: 0,
      generationVersion: 1,
      status: 'ACTIVE',
    },
  });

  // 1) 원래 저녁 항목: 3명이 싫어요 → 교체됨(REPLACED)
  const rejectedDinner = await prisma.courseItem.create({
    data: {
      courseId: course.id,
      sequence: 2,
      category: 'DINNER',
      title: '저녁식사 - 몽탄',
      placeId: 'place_dinner_mongtan',
      placeName: '몽탄',
      startAt: at(70),
      endAt: at(160),
      estimatedPricePerPerson: 32000,
      reason: '참여자들이 선호한 분위기와 잘 맞아요.',
      travelMinutesFromPrev: 10,
      generationVersion: 1,
      regenerationCount: 0,
      status: 'REPLACED',
    },
  });

  // 2) 교체된 새 저녁 항목: 3분 전에 재생성 완료 → 재투표 10분 창 중 7분 남음
  const regeneratedAt = new Date(Date.now() - 3 * MINUTE);
  // 정책 계산은 core의 함수를 그대로 쓴다. 시드에 숫자를 다시 적지 않는다.
  const revoteEndsAt = calcItemRevoteEndsAt(regeneratedAt, votingEndsAt);

  const newDinner = await prisma.courseItem.create({
    data: {
      courseId: course.id,
      sequence: 2,
      category: 'DINNER',
      title: '저녁식사 - 수아레 성수',
      placeId: 'place_dinner_soigne',
      placeName: '수아레 성수',
      address: '서울특별시 성동구 성수동2가',
      latitude: 37.5448,
      longitude: 127.0561,
      petFriendly: true,
      startAt: at(70),
      endAt: at(160),
      estimatedPricePerPerson: 28000,
      reason: '앞선 장소에서 이동하기 좋고, 반려견과 함께 들어갈 수 있어요, 알레르기 정보를 확인했어요.',
      travelMinutesFromPrev: 10,
      generationVersion: 2,
      regenerationCount: 1,
      status: 'ACTIVE',
      revoteEndsAt,
      regeneratedAt,
    },
  });

  await prisma.courseItem.update({
    where: { id: rejectedDinner.id },
    data: { replacedByItemId: newDinner.id },
  });

  // 거절된 장소는 이 약속에서 다시 추천하지 않는다.
  await prisma.rejectedPlace.create({
    data: {
      meetingId: meeting.id,
      placeId: 'place_dinner_mongtan',
      placeName: '몽탄',
      courseItemId: rejectedDinner.id,
      reason: 'MAJORITY_DISLIKE',
    },
  });

  const walk = await prisma.courseItem.create({
    data: {
      courseId: course.id,
      sequence: 3,
      category: 'WALK',
      title: '산책 - 서울숲',
      placeId: 'place_walk_forest',
      placeName: '서울숲',
      latitude: 37.5444,
      longitude: 127.0374,
      petFriendly: true,
      startAt: at(170),
      endAt: at(220),
      estimatedPricePerPerson: 0,
      reason: '반려견과 함께 들어갈 수 있어요.',
      travelMinutesFromPrev: 12,
      generationVersion: 1,
      status: 'ACTIVE',
    },
  });

  const bar = await prisma.courseItem.create({
    data: {
      courseId: course.id,
      sequence: 4,
      category: 'BAR',
      title: '술집 - 성수 양조장',
      placeId: 'place_bar_seongsu',
      placeName: '성수 양조장',
      latitude: 37.5427,
      longitude: 127.0559,
      petFriendly: true,
      startAt: at(230),
      endAt: at(320),
      estimatedPricePerPerson: 25000,
      reason: '반려견과 함께 들어갈 수 있어요, 예산 안에 들어와요.',
      travelMinutesFromPrev: 14,
      generationVersion: 1,
      status: 'ACTIVE',
    },
  });

  // 교체 전 항목에 남아 있던 싫어요 3표 (이력)
  await prisma.courseVote.createMany({
    data: [
      { courseItemId: rejectedDinner.id, userId: host.id, vote: 'DISLIKE', itemGenerationVersion: 1 },
      { courseItemId: rejectedDinner.id, userId: minseo.id, vote: 'DISLIKE', itemGenerationVersion: 1 },
      { courseItemId: rejectedDinner.id, userId: hyunwoo.id, vote: 'DISLIKE', itemGenerationVersion: 1 },
    ],
  });

  // 다른 항목에는 이미 좋아요가 모여 있다. 새 저녁 항목은 투표 0에서 시작한다.
  await prisma.courseVote.createMany({
    data: [
      { courseItemId: cafe.id, userId: host.id, vote: 'LIKE', itemGenerationVersion: 1 },
      { courseItemId: cafe.id, userId: minseo.id, vote: 'LIKE', itemGenerationVersion: 1 },
      { courseItemId: walk.id, userId: hyunwoo.id, vote: 'LIKE', itemGenerationVersion: 1 },
      { courseItemId: bar.id, userId: yerin.id, vote: 'LIKE', itemGenerationVersion: 1 },
      { courseItemId: bar.id, userId: host.id, vote: 'DISLIKE', itemGenerationVersion: 1 },
    ],
  });

  // 자동 확정 예약
  await prisma.aiJob.create({
    data: {
      meetingId: meeting.id,
      type: 'FINALIZE_COURSE',
      status: 'QUEUED',
      scheduledAt: votingEndsAt,
      payload: { courseId: course.id },
    },
  });

  await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: 'ITEM_REGENERATED',
      title: '2번 항목을 다시 골랐어요',
      body: '수아레 성수으로 바꿨어요. 10분 안에 다시 투표해 주세요.',
      meetingId: meeting.id,
      linkUrl: `/courses/${course.id}/voting`,
    })),
  });

  // 지난 달 완료된 약속 하나 (기록 화면 확인용)
  const pastStart = new Date();
  pastStart.setMonth(pastStart.getMonth() - 1);
  pastStart.setHours(13, 0, 0, 0);

  const pastMeeting = await prisma.meeting.create({
    data: {
      hostUserId: host.id,
      title: '지난달 연남동 나들이',
      scheduledStartAt: pastStart,
      scheduledEndAt: new Date(pastStart.getTime() + 5 * 60 * MINUTE),
      areaName: '연남동',
      capacity: 4,
      relationshipTags: ['FRIENDS'],
      atmosphereTags: ['QUIET'],
      responseDeadlineAt: new Date(pastStart.getTime() - 5 * 60 * MINUTE),
      status: 'COMPLETED',
      participants: {
        create: [
          { userId: host.id, role: 'HOST', status: 'INTERVIEW_COMPLETED' },
          { userId: yerin.id, status: 'INTERVIEW_COMPLETED' },
        ],
      },
      record: { create: {} },
    },
    include: { record: true },
  });

  if (pastMeeting.record) {
    await prisma.recordPost.create({
      data: {
        recordId: pastMeeting.record.id,
        authorUserId: host.id,
        content: '날씨가 좋아서 산책이 제일 기억에 남네요.',
        comments: { create: { authorUserId: yerin.id, content: '다음에 또 가요!' } },
      },
    });
  }

  console.info('완료했습니다.');
  console.info('');
  console.info('  로그인: jiwon@example.com / password1234  (방장)');
  console.info('  그 외:  minseo@example.com, hyunwoo@example.com, yerin@example.com');
  console.info('');
  console.info(`  투표 화면: /courses/${course.id}/voting`);
  console.info('  → 코스 전체 60분 타이머와, 2번 항목의 10분 재투표 타이머가 함께 돕니다.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
