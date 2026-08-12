'use client';

import { useEffect, useState } from 'react';
import type { SharedCourseSummary } from '@/server/course-share-service';

export function CourseSummaryShare({ course }: { course: SharedCourseSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const copyShareLink = async () => {
    const url = `${window.location.origin}/share/courses/${course.courseId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <button type="button" className="btn-primary mt-3" onClick={() => setOpen(true)}>
        코스 요약·공유
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/35 px-4 py-8 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-summary-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(30,74,110,.24)]">
            <div className="bg-gradient-to-br from-accent-50 via-white to-accent-100/60 px-6 pb-5 pt-6 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[.16em] text-accent-600">TODAY COURSE</p>
                  <h2 id="course-summary-title" className="mt-2 text-xl font-extrabold tracking-tight text-ink-900">
                    {course.title}
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">{course.areaName}에서 함께할 코스예요</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-xl text-ink-500 shadow-sm" aria-label="닫기">
                  ×
                </button>
              </div>
            </div>

            <ol className="max-h-[52vh] space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              {course.items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-xs font-extrabold text-white shadow-[0_6px_14px_rgba(47,146,229,.2)]">
                    {item.sequence}
                  </span>
                  <div>
                    <p className="font-bold text-ink-900">{item.placeName}</p>
                    <p className="mt-1 text-sm leading-6 text-ink-600">{item.reason}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="border-t border-ink-100 bg-ink-50/70 px-6 py-4 sm:px-8">
              <button type="button" className="btn-primary w-full" onClick={copyShareLink}>
                {copied ? '링크를 복사했어요!' : '로그인 없이 보는 링크 복사'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
