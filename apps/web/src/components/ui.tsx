import { cn } from '@/lib/cn';

/** 로딩·빈 상태·오류 상태를 한 곳에서 관리해 화면마다 다르게 보이지 않게 한다. */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 overflow-hidden px-6 py-14 text-center">
      <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-2xl shadow-sm" aria-hidden>☁️</span>
      <p className="text-base font-semibold text-ink-900">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
      {action}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-danger-100 px-3 py-2.5 text-sm font-medium text-danger-600">
      {message}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-ink-100', className)} aria-hidden />;
}

export function StatusChip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'good' | 'danger';
}) {
  const tones = {
    neutral: 'border-ink-200 bg-ink-50 text-ink-700',
    accent: 'border-accent-100 bg-accent-50 text-accent-700',
    good: 'border-good-100 bg-good-100 text-good-600',
    danger: 'border-danger-100 bg-danger-100 text-danger-600',
  };
  return <span className={cn('chip', tones[tone])}>{children}</span>;
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold tracking-tight text-ink-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
    </div>
  );
}
