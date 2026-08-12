import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { CreateMeetingForm } from '@/components/forms/create-meeting-form';
import { env } from '@/lib/env';

export const metadata = { title: '약속 만들기' };

export default async function NewMeetingPage() {
  if (!(await getSession())) redirect('/login?returnTo=/meetings/new');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">약속 만들기</h1>
      <p className="mb-8 mt-1 text-sm text-ink-500">
        만들고 나면 초대 링크가 생겨요. 참여자들이 각자 취향을 알려주면 코스를 만들어 드려요.
      </p>
      <CreateMeetingForm kakaoJsKey={env.KAKAO_JS_KEY ?? null} />
    </div>
  );
}
