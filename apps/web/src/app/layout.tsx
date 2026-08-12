import type { Metadata } from 'next';
import './globals.css';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: {
    default: '오늘코스 · 모두의 취향으로 만드는 모임 코스',
    template: '%s · 오늘코스',
  },
  description:
    '약속 참여자 전원이 AI와 따로 인터뷰하면, 모든 취향을 모아 하나의 코스를 추천합니다. 마음에 안 드는 곳만 다시 골라보세요.',
  openGraph: {
    type: 'website',
    siteName: '오늘코스',
    locale: 'ko_KR',
    images: [{ url: '/today-course-logo.png', width: 512, height: 512, alt: '오늘코스 로고' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
