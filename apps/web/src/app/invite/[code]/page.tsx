import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { InviteActions } from '@/components/invite-actions';
import { getSession } from '@/lib/auth/session';
import { previewInvitation } from '@/server/meeting-service';
import { formatDate, formatTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** 카카오톡·슬랙에 링크를 붙여넣었을 때 카드로 보이도록 OG 태그를 채운다. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  try {
    const invitation = await previewInvitation(code, null);
    const title = `${invitation.hostNickname}님이 "${invitation.meetingTitle}"에 초대했어요`;
    const description = `${formatDate(invitation.scheduledStartAt)} ${formatTime(
      invitation.scheduledStartAt,
    )} · ${invitation.areaName}`;
    return { title, description, openGraph: { title, description, type: 'website' } };
  } catch {
    return { title: '초대장' };
  }
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSession();

  let invitation;
  try {
    invitation = await previewInvitation(code, session?.userId ?? null);
  } catch {
    return (
      <>
        <SiteHeader />
        <main className="container-page flex justify-center py-20">
          <div className="card max-w-md p-8 text-center">
            <h1 className="text-lg font-bold tracking-tight">초대장을 찾을 수 없어요</h1>
            <p className="mt-2 text-sm text-ink-500">링크가 잘못됐거나 삭제된 약속이에요.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="container-page flex justify-center py-14">
        <div className="w-full max-w-md">
          <article className="card overflow-hidden">
            <div className="border-b border-ink-100 bg-ink-50 px-6 py-5 text-center">
              <p className="text-sm text-ink-500">{invitation.hostNickname}님이 초대했어요</p>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight">{invitation.meetingTitle}</h1>
            </div>

            <dl className="space-y-3 px-6 py-6 text-sm">
              <Row label="언제">
                {formatDate(invitation.scheduledStartAt)}
                <br />
                {formatTime(invitation.scheduledStartAt)} – {formatTime(invitation.scheduledEndAt)}
              </Row>
              <Row label="어디서">{invitation.areaName}</Row>
              <Row label="몇 명">
                {invitation.currentParticipantCount}/{invitation.capacity}명
              </Row>
            </dl>

            <div className="border-t border-ink-100 px-6 py-5">
              {invitation.expired ? (
                <p className="text-center text-sm font-medium text-ink-500">
                  이 초대 링크는 만료됐어요. 방장에게 새 링크를 요청해 주세요.
                </p>
              ) : invitation.alreadyJoined ? (
                <a href={`/meetings/${invitation.meetingId}`} className="btn-primary w-full">
                  약속으로 가기
                </a>
              ) : session ? (
                <InviteActions inviteCode={code} />
              ) : (
                <div className="space-y-2">
                  <a href={`/login?returnTo=/invite/${code}`} className="btn-primary w-full">
                    로그인하고 참여하기
                  </a>
                  <p className="text-center text-xs text-ink-500">
                    가입하면 취향을 저장해두고 다음 약속에서 바로 쓸 수 있어요.
                  </p>
                </div>
              )}
            </div>
          </article>

          <p className="mt-5 text-center text-sm leading-relaxed text-ink-500">
            참여하면 AI가 몇 가지를 물어봐요. 답변은 나만 볼 수 있고, 모두의 취향을 모아 코스 하나를 추천해요.
          </p>
        </div>
      </main>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-16 shrink-0 text-ink-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
