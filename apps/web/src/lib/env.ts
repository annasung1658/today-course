import { z } from 'zod';

/**
 * 환경변수 검증.
 * 필수값이 없으면 즉시 실패하고, 외부 연동값은 없어도 앱이 뜨도록 optional로 둔다.
 * 지시서 §6.1: "카카오 로그인과 외부 서비스는 환경변수가 없더라도 앱 전체가 깨지지 않도록 구성하세요."
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Vercel이 배포 시 자동 주입. 프리뷰 빌드도 NODE_ENV는 항상 'production'이라(Next.js가
   * next build 시 그렇게 고정한다) 진짜 운영 배포인지는 이 값으로만 구분할 수 있다. Vercel
   * 밖에서 도는 경우(로컬 등)엔 없다. */
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
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

/**
 * AUTH_SECRET/CRON_SECRET은 로컬 개발 편의를 위해 기본값을 두지만, 그 기본값은
 * .env.example에 그대로 공개되어 있다 — 운영 환경에서 설정을 깜빡하면 누구나
 * 세션을 위조하거나(AUTH_SECRET) 내부 스케줄러를 호출(CRON_SECRET)할 수 있게
 * 조용히 뚫린다. 운영에서는 기본값이면 부팅 자체를 막는다.
 *
 * "운영"인지는 VERCEL_ENV로 판단한다(있으면). NODE_ENV로 판단하면 안 된다 — Vercel은
 * 프리뷰 배포도 next build를 그대로 쓰기 때문에 NODE_ENV가 항상 'production'이라, 그
 * 기준으로는 dev를 포함한 모든 브랜치 프리뷰까지 이 검증에 걸려 부팅 자체가 실패한다
 * (실제로 겪은 버그). Vercel 밖(로컬 production 빌드 등)에서는 VERCEL_ENV가 없으니
 * NODE_ENV로 대신 판단한다.
 */
const withProductionSecretCheck = schema.superRefine((value, ctx) => {
  const isRealProduction = value.VERCEL_ENV ? value.VERCEL_ENV === 'production' : value.NODE_ENV === 'production';
  if (!isRealProduction) return;
  if (value.AUTH_SECRET === 'dev-only-secret-change-me-please') {
    ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET'], message: '운영 환경에서는 기본값을 쓸 수 없습니다. openssl rand -base64 32로 새로 발급하세요.' });
  }
  if (value.CRON_SECRET === 'dev-cron-secret') {
    ctx.addIssue({ code: 'custom', path: ['CRON_SECRET'], message: '운영 환경에서는 기본값을 쓸 수 없습니다.' });
  }
});

const parsed = withProductionSecretCheck.safeParse(process.env);

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
