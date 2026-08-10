import type { Config } from 'tailwindcss';

/**
 * 디자인 방향(지시서 §21): 흰 배경 / 검정·회색 중심 / 연한 파란색 포인트 /
 * 경고에만 최소한의 빨간색. 그래디언트·장식 금지.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/*/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#111214',
          700: '#3a3d42',
          500: '#6b7076',
          300: '#a8adb3',
          200: '#d5d8dc',
          100: '#e9ebee',
          50: '#f6f7f8',
        },
        accent: {
          700: '#1f5fa8',
          600: '#2b7cd3',
          500: '#4a95e6',
          100: '#e2eefb',
          50: '#f2f7fd',
        },
        danger: { 600: '#c8322b', 100: '#fbe9e8' },
        good: { 600: '#2f7a4f', 100: '#e6f3ec' },
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      maxWidth: { content: '72rem' },
      borderRadius: { card: '0.75rem' },
    },
  },
  plugins: [],
};

export default config;
