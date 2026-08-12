import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { getSharedCourseSummary } from '@/server/course-share-service';

export const dynamic = 'force-dynamic';
export const metadata = { title: '공유받은 오늘코스' };

export default async function SharedCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = await getSharedCourseSummary(courseId).catch(() => null);
  if (!course) notFound();

  return (
    <main className="container-page flex min-h-screen max-w-2xl flex-col justify-center py-10 sm:py-16">
      <Link href="/" className="mb-7 flex w-fit items-center gap-2.5 text-lg font-extrabold tracking-tight">
        <BrandLogo size={42} priority />
        오늘코스
      </Link>

      <article className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(30,74,110,.18)]">
        <header className="bg-gradient-to-br from-accent-50 via-white to-accent-100/60 px-6 py-7 sm:px-9 sm:py-9">
          <p className="text-xs font-bold tracking-[.16em] text-accent-600">SHARED COURSE</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900">{course.title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-500">{course.areaName}에서 함께할 코스예요</p>
        </header>

        <ol className="space-y-6 px-6 py-7 sm:px-9 sm:py-9">
          {course.items.map((item) => (
            <li key={item.id} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-sm font-extrabold text-white shadow-[0_6px_14px_rgba(47,146,229,.2)]">
                {item.sequence}
              </span>
              <div>
                <h2 className="font-bold text-ink-900">{item.placeName}</h2>
                <p className="mt-1 text-sm leading-6 text-ink-600">{item.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      </article>

      <p className="mt-6 text-center text-xs text-ink-400">오늘코스 · 모두의 취향으로 만든 모임 코스</p>
    </main>
  );
}
