import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 모노레포의 워크스페이스 패키지는 소스 그대로 들어오므로 Next가 직접 컴파일한다.
  transpilePackages: ['@oneulcourse/core'],
  // 웹사이트이므로 이미지 원격 소스는 스토리지 도메인만 허용한다.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'k.kakaocdn.net' },
      { protocol: 'https', hostname: 'img1.kakaocdn.net' },
    ],
  },
  typedRoutes: false,
};

export default nextConfig;
