'use client';

import { useState } from 'react';
import { formatDate, formatTime } from '@/lib/format';
import { BrandLogo } from '@/components/brand-logo';

interface InvitationRevealProps {
  hostNickname: string;
  meetingTitle: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  areaName: string;
  currentParticipantCount: number;
  capacity: number;
  actions: React.ReactNode;
}

export function InvitationReveal({
  hostNickname,
  meetingTitle,
  scheduledStartAt,
  scheduledEndAt,
  areaName,
  currentParticipantCount,
  capacity,
  actions,
}: InvitationRevealProps) {
  const [opened, setOpened] = useState(false);

  return (
    <div className="w-full max-w-lg text-center">
      <div className="mb-7 animate-fade-up">
        <span className="chip border-accent-100 bg-white/85 text-accent-700 shadow-sm">특별한 약속이 도착했어요</span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
          {hostNickname}님이 보낸 초대장
        </h1>
        <p className="mt-2 text-sm text-ink-500">봉투를 열어 약속을 확인해 보세요.</p>
      </div>

      <div className="relative mx-auto min-h-[34rem] [perspective:1200px] sm:min-h-[36rem]">
        <div
          className={`absolute inset-x-4 top-16 z-10 rounded-[1.75rem] border border-white bg-white p-6 text-left shadow-lift transition-all duration-700 ease-out sm:inset-x-8 sm:p-8 ${
            opened ? 'pointer-events-auto -translate-y-14 opacity-100' : 'pointer-events-none translate-y-28 scale-[.94] opacity-0'
          }`}
          aria-hidden={!opened}
        >
          <div className="text-center">
            <BrandLogo size={52} decorative className="mx-auto shadow-sm" />
            <p className="mt-4 text-sm font-semibold text-accent-700">우리 같이 가요!</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{meetingTitle}</h2>
          </div>

          <dl className="mt-7 space-y-3 rounded-2xl bg-accent-50/70 p-4 text-sm">
            <InviteRow icon="🗓️" label="언제">
              {formatDate(scheduledStartAt)} · {formatTime(scheduledStartAt)} – {formatTime(scheduledEndAt)}
            </InviteRow>
            <InviteRow icon="📍" label="어디서">{areaName}</InviteRow>
            <InviteRow icon="👥" label="함께">
              {currentParticipantCount}/{capacity}명
            </InviteRow>
          </dl>

          <div className={`mt-6 transition-all delay-500 duration-500 ${opened ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>
            {actions}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpened(true)}
          disabled={opened}
          className={`group absolute inset-x-0 top-36 mx-auto h-64 w-full max-w-md text-left transition-all duration-700 ${
            opened ? 'translate-y-52 scale-[.96] opacity-40' : 'animate-float cursor-pointer hover:scale-[1.02]'
          }`}
          aria-label="초대장 열기"
          aria-expanded={opened}
        >
          <span className="absolute inset-0 overflow-hidden rounded-[2rem] bg-accent-500 shadow-[0_24px_55px_rgba(47,146,229,.28)]">
            <span className="absolute inset-x-0 bottom-0 h-full bg-accent-600 [clip-path:polygon(0_100%,50%_44%,100%_100%)]" />
            <span className="absolute inset-y-0 left-0 w-full bg-[#78c1f7] [clip-path:polygon(0_0,51%_58%,0_100%)]" />
            <span className="absolute inset-y-0 right-0 w-full bg-[#67b5f0] [clip-path:polygon(100%_0,49%_58%,100%_100%)]" />
          </span>

          <span
            className={`absolute inset-x-0 top-0 h-[58%] origin-top rounded-t-[2rem] bg-[#9bd4fb] transition-transform duration-700 [backface-visibility:hidden] [clip-path:polygon(0_0,100%_0,50%_100%)] ${
              opened ? '[transform:rotateX(180deg)]' : '[transform:rotateX(0deg)]'
            }`}
          />

          {!opened && (
            <span className="absolute left-1/2 top-[45%] z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
              <span className="rounded-[1.35rem] border-4 border-white/70 bg-white shadow-lg transition-transform group-hover:scale-110">
                <BrandLogo size={60} decorative />
              </span>
              <span className="mt-4 rounded-full bg-white/95 px-5 py-2 text-sm font-extrabold text-accent-700 shadow-md">
                초대장 열어보기
              </span>
            </span>
          )}
        </button>
      </div>

      <p className={`mx-auto max-w-md text-sm leading-relaxed text-ink-500 transition-opacity delay-500 duration-500 ${opened ? 'opacity-100' : 'opacity-0'}`}>
        참여하면 AI가 취향을 가볍게 물어보고, 모두에게 잘 맞는 코스를 추천해 드려요.
      </p>
    </div>
  );
}

function InviteRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-base shadow-sm" aria-hidden>{icon}</span>
      <div>
        <dt className="text-xs font-semibold text-ink-500">{label}</dt>
        <dd className="mt-0.5 font-bold text-ink-900">{children}</dd>
      </div>
    </div>
  );
}
