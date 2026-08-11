import { SiteHeader } from '@/components/site-header';

/** 로그인 이후 화면 공통 골격. 상단 GNB + 본문. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container-page flex-1 py-8 sm:py-12">{children}</main>
      <footer className="border-t border-white/80 bg-white/45 py-7 backdrop-blur">
        <div className="container-page text-xs text-ink-300">오늘코스 · 모두의 취향으로 만드는 모임 코스</div>
      </footer>
    </div>
  );
}
