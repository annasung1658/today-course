import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { InviteActions } from '@/components/invite-actions';
import { InvitationReveal } from '@/components/invitation-reveal';
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
      <main className="container-page flex justify-center overflow-hidden py-10 sm:py-14">
        <InvitationReveal
          hostNickname={invitation.hostNickname}
          meetingTitle={invitation.meetingTitle}
          scheduledStartAt={invitation.scheduledStartAt}
          scheduledEndAt={invitation.scheduledEndAt}
          areaName={invitation.areaName}
          currentParticipantCount={invitation.currentParticipantCount}
          capacity={invitation.capacity}
          actions={
            invitation.expired ? (
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
              )
          }
        />
      </main>
    </>
  );
}
