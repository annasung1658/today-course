'use client';

import { useEffect, useState } from 'react';
import type { SharedCourseSummary } from '@/server/course-share-service';
import { KakaoRouteMap } from '@/components/kakao-map';

export function CourseSummaryShare({ course, kakaoJsKey }: { course: SharedCourseSummary; kakaoJsKey: string | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setShareUrl(`${window.location.origin}/share/courses/${course.courseId}`);
  }, [course.courseId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
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
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(30,74,110,.24)]">
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

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-accent-50/30 px-4 py-5 sm:px-6">
              <KakaoRouteMap
                apiKey={kakaoJsKey}
                points={course.items.map((item) => ({
                  sequence: item.sequence,
                  placeName: item.placeName,
                  address: item.address,
                  latitude: item.latitude,
                  longitude: item.longitude,
                  travelMinutesFromPrev: item.travelMinutesFromPrev,
                }))}
              />

              <div className="card space-y-5 p-5 sm:p-6">
                <h3 className="font-extrabold text-ink-900">이 코스를 고른 이유</h3>
                <ol className="space-y-5">
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
              </div>
            </div>

            <div className="shrink-0 border-t border-ink-100 bg-white px-5 py-4 sm:px-7">
              <p className="mb-2 text-xs font-bold text-ink-500">로그인 없이 볼 수 있는 공유 링크</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="field min-w-0 flex-1 text-sm" value={shareUrl} readOnly aria-label="공유 링크" onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="btn-primary shrink-0" onClick={copyShareLink} disabled={!shareUrl}>
                  {copied ? '링크를 복사했어요!' : '로그인 없이 보는 링크 복사'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
