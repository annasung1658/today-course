import { z } from 'zod';

/**
 * 환경변수 검증.
 * 필수값이 없으면 즉시 실패하고, 외부 연동값은 없어도 앱이 뜨도록 optional로 둔다.
 * 지시서 §6.1: "카카오 로그인과 외부 서비스는 환경변수가 없더라도 앱 전체가 깨지지 않도록 구성하세요."
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('postgresql://oneulcourse:oneulcourse@localhost:5432/oneulcourse'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** 세션 서명 키. 운영에서는 반드시 교체한다. */
  AUTH_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),

  KAKAO_CLIENT_ID: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  KAKAO_REST_API_KEY: z.string().optional(),
  KAKAO_JS_KEY: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('oneulcourse'),

  /** 스케줄러(크론) 호출 인증용 */
  CRON_SECRET: z.string().default('dev-cron-secret'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`환경변수 설정이 올바르지 않습니다.\n${issues}`);
}

export const env = parsed.data;

/** 어떤 Provider가 실제 연동인지 Mock인지 한눈에 본다. */
export const providerMode = {
  auth: env.KAKAO_CLIENT_ID ? 'KAKAO' : 'EMAIL_ONLY',
  ai: env.GEMINI_API_KEY ? 'GEMINI' : 'MOCK',
  place: env.KAKAO_REST_API_KEY ? 'KAKAO_LOCAL' : 'MOCK',
  storage: env.SUPABASE_URL ? 'SUPABASE' : 'MOCK',
} as const;

export const isKakaoLoginEnabled = () => Boolean(env.KAKAO_CLIENT_ID && env.KAKAO_CLIENT_SECRET);
