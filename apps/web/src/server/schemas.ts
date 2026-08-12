import { z } from 'zod';
import { meetingPolicy } from '@oneulcourse/core';

/**
 * 입력 검증과 AI 출력 검증 스키마.
 * AI의 자유 텍스트 응답은 반드시 여기를 통과해야 DB에 저장된다.
 */

export const courseItemCategorySchema = z.enum([
  'BREAKFAST',
  'CAFE',
  'LUNCH',
  'DINNER',
  'WALK',
  'EXHIBITION',
  'ACTIVITY',
  'SHOPPING',
  'BAR',
]);

const isoDate = z.union([z.string().datetime({ offset: true }), z.date()]).transform((v) => new Date(v));

// ── AI 출력 검증 ────────────────────────────────────────────────────

export const generatedCourseItemSchema = z.object({
  sequence: z.number().int().positive(),
  category: courseItemCategorySchema,
  title: z.string().min(1).max(120),
  placeId: z.string().nullable(),
  placeName: z.string().min(1).max(120),
  address: z.string().max(300).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  startAt: isoDate,
  endAt: isoDate,
  estimatedPricePerPerson: z.number().int().min(0).max(1_000_000),
  reason: z.string().min(1).max(500),
  travelMinutesFromPrev: z.number().int().min(0).max(240),
  fixedScheduleId: z.string().nullable(),
});

export const generatedCourseSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  estimatedBudgetPerPerson: z.number().int().min(0).max(2_000_000),
  items: z.array(generatedCourseItemSchema).min(1).max(10),
});

export const extractedPreferenceSchema = z.object({
  preferredFoods: z.array(z.string().max(40)).max(20),
  dislikedFoods: z.array(z.string().max(40)).max(20),
  allergies: z.array(z.string().max(40)).max(20),
  preferredActivities: z.array(z.string().max(40)).max(20),
  // "보드게임카페"처럼 사용자가 직접 말한 구체적 장소 키워드. 검색어 우선순위 1순위로 쓴다.
  activityKeywords: z.array(z.string().max(60)).max(20).default([]),
  preferredAtmospheres: z.array(z.string().max(40)).max(20),
  budget: z
    .object({
      min: z.number().int().min(0).max(10_000_000),
      max: z.number().int().min(0).max(10_000_000),
      currency: z.string().length(3).default('KRW'),
    })
    .nullable(),
  mustHave: z.array(z.string().max(40)).max(20),
  mustAvoid: z.array(z.string().max(40)).max(20),
});

// ── 인증 ────────────────────────────────────────────────────────────

export const signupSchema = z.object({
  email: z.string().email('이메일 형식이 올바르지 않습니다.'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(72),
  nickname: z.string().min(1, '닉네임을 입력해 주세요.').max(20),
  termsAgreementIds: z.array(z.string()).default([]),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const guestbookEntrySchema = z.object({
  content: z.string().trim().min(1, '방명록 내용을 입력해 주세요.').max(300, '방명록은 300자까지 남길 수 있어요.'),
  anonymous: z.boolean().default(false),
});

// ── 사용자 ──────────────────────────────────────────────────────────

export const updateMeSchema = z.object({
  nickname: z.string().min(1).max(20).optional(),
  profileImageUrl: z.string().url().nullable().optional(),
});

export const userPreferenceSchema = z.object({
  preferredFoods: z.array(z.string().max(40)).max(20).default([]),
  dislikedFoods: z.array(z.string().max(40)).max(20).default([]),
  // 알레르기는 안전조건이라 비선호와 분리해서 받는다.
  allergies: z.array(z.string().max(40)).max(20).default([]),
  preferredActivities: z.array(z.string().max(40)).max(20).default([]),
  preferredAtmospheres: z.array(z.string().max(40)).max(20).default([]),
  budget: z
    .object({
      min: z.number().int().min(0),
      max: z.number().int().min(0),
      currency: z.string().default('KRW'),
    })
    .nullable()
    .default(null),
  mustHave: z.array(z.string().max(40)).max(20).default([]),
  mustAvoid: z.array(z.string().max(40)).max(20).default([]),
  additionalNotes: z.string().max(1000).nullable().default(null),
});

// ── 약속 ────────────────────────────────────────────────────────────

const fixedScheduleInputSchema = z.object({
  title: z.string().min(1).max(60),
  startAt: isoDate,
  endAt: isoDate,
  placeName: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
  placeId: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const createMeetingSchema = z
  .object({
    title: z.string().min(1, '모임 이름을 입력해 주세요.').max(60),
    scheduledStartAt: isoDate,
    scheduledEndAt: isoDate,
    area: z.object({
      name: z.string().min(1, '지역을 입력해 주세요.').max(60),
      address: z.string().max(300).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }),
    capacity: z.number().int().min(meetingPolicy.minCapacity).max(meetingPolicy.maxCapacity),
    relationshipTags: z.array(z.string().max(30)).max(5).default([]),
    relationshipDescription: z.string().max(200).optional(),
    atmosphereTags: z.array(z.string().max(30)).max(5).default([]),
    atmosphereDescription: z.string().max(200).optional(),
    fixedSchedules: z.array(fixedScheduleInputSchema).max(5).default([]),
    specialNotes: z.string().max(1000).optional(),
    responseDeadlineAt: isoDate.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scheduledEndAt <= value.scheduledStartAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledEndAt'],
        message: '종료시간은 시작시간보다 뒤여야 합니다.',
      });
    }

    for (const [index, fixed] of value.fixedSchedules.entries()) {
      if (fixed.endAt <= fixed.startAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fixedSchedules', index, 'endAt'],
          message: '픽스 일정의 종료시간이 시작시간보다 빠릅니다.',
        });
      }
      if (fixed.startAt < value.scheduledStartAt || fixed.endAt > value.scheduledEndAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fixedSchedules', index],
          message: '픽스 일정은 약속 시간 안에 있어야 합니다.',
        });
      }
      // 픽스 일정끼리 겹치면 안 된다.
      for (const other of value.fixedSchedules.slice(index + 1)) {
        if (fixed.startAt < other.endAt && other.startAt < fixed.endAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fixedSchedules', index],
            message: '픽스 일정끼리 시간이 겹칩니다.',
          });
        }
      }
    }

    if (value.responseDeadlineAt && value.responseDeadlineAt >= value.scheduledStartAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responseDeadlineAt'],
        message: '응답 마감은 약속 시작 전이어야 합니다.',
      });
    }
  });

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(60).optional(),
  responseDeadlineAt: isoDate.optional(),
  specialNotes: z.string().max(1000).nullable().optional(),
  capacity: z.number().int().min(meetingPolicy.minCapacity).max(meetingPolicy.maxCapacity).optional(),
});

// ── 인터뷰 ──────────────────────────────────────────────────────────

export const startInterviewSchema = z.object({
  loadDefaultPreferences: z.boolean().default(false),
});

/** 설문 형식 인터뷰. 전부 무응답을 허용한다. */
export const surveyAnswersSchema = z.object({
  foodWant: z.string().max(500).optional(),
  foodAvoid: z.string().max(500).optional(),
  activityWant: z.string().max(500).optional(),
  activityAvoid: z.string().max(500).optional(),
  budget: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

// ── 투표 ────────────────────────────────────────────────────────────

export const castVoteSchema = z.object({
  vote: z.enum(['LIKE', 'DISLIKE']),
  // 교체된 항목에 대한 늦은 투표를 걸러내기 위해 반드시 받는다.
  itemGenerationVersion: z.number().int().positive(),
});

// ── 기록·피드백 ─────────────────────────────────────────────────────

export const recordPhotoSchema = z.object({
  courseItemId: z.string().nullable().default(null),
  fileUrl: z.string().min(1),
  storageKey: z.string().optional(),
  caption: z.string().max(300).nullable().default(null),
});

export const recordPostSchema = z.object({
  courseItemId: z.string().nullable().default(null),
  content: z.string().min(1, '내용을 입력해 주세요.').max(2000),
});

export const recordCommentSchema = z.object({
  content: z.string().min(1, '댓글을 입력해 주세요.').max(500),
});

export const feedbackRatingSchema = z.enum(['VERY_GOOD', 'GOOD', 'NEUTRAL', 'BAD', 'VERY_BAD']);

export const feedbackDraftSchema = z.object({
  rating: feedbackRatingSchema.nullable().default(null),
  content: z.string().max(2000).nullable().default(null),
  courseItemFeedbacks: z
    .array(
      z.object({
        courseItemId: z.string(),
        rating: feedbackRatingSchema.nullable().default(null),
        reasonCodes: z
          .array(z.enum(['TOO_EXPENSIVE', 'TOO_MUCH_WALKING', 'GOOD_ATMOSPHERE', 'TOO_CROWDED', 'TOO_FAR']))
          .max(5)
          .default([]),
        wouldRevisit: z.boolean().nullable().default(null),
      }),
    )
    .max(10)
    .default([]),
});

export const presignedUploadSchema = z.object({
  contentType: z.string().min(1),
  extension: z.string().min(1).max(5),
});
