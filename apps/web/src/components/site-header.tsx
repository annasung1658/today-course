import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

/** 웹사이트용 상단 내비게이션. 모바일에서는 메뉴가 가로 스크롤된다. */
export async function SiteHeader() {
  const session = await getSession();
  const unread = session
    ? await prisma.notification.count({ where: { userId: session.userId, readAt: null } })
    : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          오늘코스
        </Link>

        {session ? (
          <>
            <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm" aria-label="주요 메뉴">
              <HeaderLink href="/meetings">내 약속</HeaderLink>
              <HeaderLink href="/records">지난 기록</HeaderLink>
              <HeaderLink href="/settings/preferences">내 기본 설정</HeaderLink>
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/notifications" className="btn-ghost relative px-3">
                알림
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-600 px-1 text-[11px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <Link href="/settings/account" className="btn-secondary">
                {session.nickname}
              </Link>
              <Link href="/meetings/new" className="btn-primary hidden sm:inline-flex">
                약속 만들기
              </Link>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost">
              로그인
            </Link>
            <Link href="/signup" className="btn-primary">
              시작하기
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
    >
      {children}
    </Link>
  );
}
