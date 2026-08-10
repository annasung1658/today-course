import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { PreferenceForm, type PreferenceValue } from '@/components/preference-form';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = { title: '내 기본 설정' };
export const dynamic = 'force-dynamic';

const OPTIONS = {
  foods: [
    { value: 'KOREAN', label: '한식' },
    { value: 'JAPANESE', label: '일식' },
    { value: 'CHINESE', label: '중식' },
    { value: 'WESTERN', label: '양식' },
    { value: 'ASIAN', label: '아시안' },
    { value: 'SNACK', label: '분식' },
  ],
  activities: [
    { value: 'WALK', label: '산책' },
    { value: 'EXHIBITION', label: '전시' },
    { value: 'SHOPPING', label: '쇼핑' },
    { value: 'ACTIVITY', label: '체험·공방' },
    { value: 'CAFE', label: '카페' },
    { value: 'BAR', label: '술집' },
  ],
  atmospheres: [
    { value: 'QUIET', label: '조용한' },
    { value: 'CASUAL', label: '편안한' },
    { value: 'TRENDY', label: '트렌디한' },
    { value: 'SPECIAL', label: '특별한' },
  ],
  allergies: [
    { value: 'PEANUT', label: '땅콩' },
    { value: 'TREE_NUT', label: '견과류' },
    { value: 'SHELLFISH', label: '갑각류' },
    { value: 'DAIRY', label: '유제품' },
    { value: 'EGG', label: '계란' },
    { value: 'GLUTEN', label: '밀·글루텐' },
  ],
  mustHave: [
    { value: 'PET_FRIENDLY', label: '반려견 동반' },
    { value: 'STEP_FREE', label: '계단 없는 입구' },
    { value: 'PARKING', label: '주차 가능' },
    { value: 'PRIVATE_ROOM', label: '룸 있음' },
  ],
  mustAvoid: [
    { value: 'LONG_WAIT', label: '긴 웨이팅' },
    { value: 'CROWDED', label: '붐비는 곳' },
    { value: 'SPICY', label: '매운 음식' },
    { value: 'SMOKING', label: '흡연 가능 공간' },
  ],
};

export default async function PreferencesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const pref = await prisma.userPreference.findUnique({ where: { userId: session.userId } });

  const initial: PreferenceValue | null = pref
    ? {
        preferredFoods: pref.preferredFoods,
        dislikedFoods: pref.dislikedFoods,
        allergies: pref.allergies,
        preferredActivities: pref.preferredActivities,
        preferredAtmospheres: pref.preferredAtmospheres,
        budget:
          pref.budgetMin !== null && pref.budgetMax !== null
            ? { min: pref.budgetMin, max: pref.budgetMax, currency: pref.budgetCurrency }
            : null,
        mustHave: pref.mustHave,
        mustAvoid: pref.mustAvoid,
        additionalNotes: pref.additionalNotes,
      }
    : null;

  return (
      <div className="space-y-6">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight">내 기본 설정</h1>
          <p className="mt-2 mb-8 text-sm leading-relaxed text-ink-500">
            여기에 저장해두면 새 약속에서 인터뷰를 시작할 때 불러올 수 있어요. 저장한 내용이 자동으로 제출되지는
            않아요.
          </p>
          <PreferenceForm initial={initial} options={OPTIONS} />
        </div>
      </div>
  );
}
