import type { Config } from 'tailwindcss';

/** 밝고 포근한 하늘색을 중심으로 한 제품 UI 토큰. */
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
          700: '#1478c9',
          600: '#2f92e5',
          500: '#55adf2',
          100: '#dcefff',
          50: '#f0f8ff',
        },
        danger: { 600: '#c8322b', 100: '#fbe9e8' },
        good: { 600: '#2f7a4f', 100: '#e6f3ec' },
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      maxWidth: { content: '72rem' },
      borderRadius: { card: '1.5rem' },
      boxShadow: {
        card: '0 10px 30px rgba(48, 127, 190, 0.08)',
        lift: '0 16px 42px rgba(48, 127, 190, 0.15)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'bouncy-ball': {
          '0%, 12%, 30%, 100%': { transform: 'translateY(0) scaleX(1) scaleY(1)' },
          '6%': { transform: 'translateY(-18px) scaleX(.96) scaleY(1.04)' },
          '16%': { transform: 'translateY(-10px) scaleX(.98) scaleY(1.02)' },
          '23%': { transform: 'translateY(-5px)' },
          '28%': { transform: 'translateY(0) scaleX(1.06) scaleY(.94)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.22,1,.36,1) both',
        float: 'float 4s ease-in-out infinite',
        'bouncy-ball': 'bouncy-ball 2.8s cubic-bezier(.25,.8,.35,1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
