'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { BrandLogo } from '@/components/brand-logo';
import { ErrorNotice } from '@/components/ui';

interface GuestbookEntry {
  id: string;
  content: string;
  createdAt: string;
  isAnonymous: boolean;
  author: { id: string | null; nickname: string; profileImageUrl: string | null };
}

export function GuestbookFloatingBall({ nickname }: { nickname: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'write' | 'board'>('write');
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ entries: GuestbookEntry[] }>('/guestbook?limit=50');
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '방명록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  };

  const show = () => {
    setView('write');
    setSubmitted(false);
    setOpen(true);
    void load();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = content.trim();
    if (!message || posting) return;
    setPosting(true);
    setError(null);
    try {
      const data = await apiFetch<{ entry: GuestbookEntry }>('/guestbook', {
        method: 'POST',
        body: JSON.stringify({ content: message, anonymous }),
      });
      setEntries((current) => [data.entry, ...current]);
      setContent('');
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '방명록을 남기지 못했어요.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-24 right-4 z-40 flex items-end gap-2 sm:bottom-28 sm:right-7">
        <button
          type="button"
          onClick={show}
          className="relative mb-4 rounded-2xl border border-accent-100 bg-white/95 px-4 py-2.5 text-sm font-extrabold text-accent-700 shadow-card backdrop-blur transition hover:-translate-y-0.5"
        >
          <span className="absolute -right-2 bottom-3 h-4 w-4 rotate-45 border-r border-t border-accent-100 bg-white" />
          <span className="relative">방명록에 남겨주세요!!</span>
        </button>
        <button
          type="button"
          onClick={show}
          className="animate-bouncy-ball rounded-[1.35rem] border-4 border-white bg-white shadow-[0_14px_30px_rgba(47,146,229,.3)] transition hover:scale-105"
          aria-label="방명록 열기"
        >
          <BrandLogo size={58} decorative />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <section className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_90px_rgba(18,54,82,.35)]" role="dialog" aria-modal="true" aria-labelledby="guestbook-title">
            <header className="flex items-center justify-between border-b border-accent-100 bg-gradient-to-r from-accent-50 to-white px-5 py-4">
              <div className="flex items-center gap-3">
                <BrandLogo size={42} decorative />
                <div>
                  <p className="text-xs font-bold text-accent-600">오늘코스의 작은 광장</p>
                  <h2 id="guestbook-title" className="text-lg font-extrabold">방명록</h2>
                </div>
              </div>
              <button type="button" className="rounded-xl px-3 py-2 text-sm text-ink-500 hover:bg-white" onClick={() => setOpen(false)}>닫기</button>
            </header>

            <div className="flex gap-2 border-b border-ink-100 px-4 py-3 sm:px-5">
              <button type="button" onClick={() => { setView('write'); setSubmitted(false); }} className={view === 'write' ? 'rounded-full bg-accent-500 px-4 py-2 text-sm font-bold text-white' : 'rounded-full bg-ink-50 px-4 py-2 text-sm font-bold text-ink-500'}>남기기</button>
              <button type="button" onClick={() => setView('board')} className={view === 'board' ? 'rounded-full bg-accent-500 px-4 py-2 text-sm font-bold text-white' : 'rounded-full bg-ink-50 px-4 py-2 text-sm font-bold text-ink-500'}>모두의 방명록</button>
            </div>

            {view === 'write' ? (
              <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
                {submitted ? (
                  <div className="mx-auto max-w-md py-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-50 text-2xl">✓</div>
                    <h3 className="text-xl font-extrabold">방명록에 등록했어요!</h3>
                    <p className="mt-2 text-sm text-ink-500">다른 분들이 남긴 이야기도 함께 둘러보세요.</p>
                    <button type="button" className="btn-primary mt-6 w-full" onClick={() => setView('board')}>확인 · 다른 방명록 보기</button>
                  </div>
                ) : (
                  <form onSubmit={submit} className="mx-auto max-w-xl">
                    <div className="mb-4 rounded-2xl border border-accent-100 bg-accent-50/60 p-4">
                      <p className="text-xs font-bold text-accent-600">로그인한 아이디</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-base text-ink-900">{nickname}</strong>
                        <button type="button" aria-pressed={anonymous} onClick={() => setAnonymous((value) => !value)} className={anonymous ? 'rounded-full bg-accent-500 px-4 py-2 text-sm font-bold text-white' : 'rounded-full border border-accent-200 bg-white px-4 py-2 text-sm font-bold text-accent-700'}>
                          {anonymous ? '익명으로 남기기 선택됨' : '익명으로 남기기'}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-ink-400">{anonymous ? '다른 사람에게는 “익명 여행자”로 보여요.' : '방명록에 로그인 아이디가 표시돼요.'}</p>
                    </div>
                    <textarea className="field min-h-32 resize-none" maxLength={300} value={content} onChange={(event) => setContent(event.target.value)} placeholder="오늘코스에 한마디 남겨주세요 :)" aria-label="방명록 내용" />
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-ink-300">{content.length}/300</span>
                      <button type="submit" className="btn-primary" disabled={!content.trim() || posting}>{posting ? '남기는 중' : '방명록 등록'}</button>
                    </div>
                    <button type="button" className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-accent-600 hover:bg-accent-50" onClick={() => setView('board')}>먼저 다른 방명록 둘러보기</button>
                    {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
                  </form>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto bg-accent-50/40 p-4 sm:p-5">
                {error && <div className="mb-4"><ErrorNotice message={error} /></div>}
                {loading ? (
                  <p className="py-10 text-center text-sm text-ink-500">방명록을 펼치는 중이에요...</p>
                ) : entries.length === 0 ? (
                  <p className="py-10 text-center text-sm text-ink-500">첫 번째 인사를 남겨주세요!</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {entries.map((entry) => (
                      <li key={entry.id} className="min-h-40 rounded-2xl border border-white bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-bold text-ink-900">{entry.author.nickname}</span>
                          <time className="shrink-0 text-xs text-ink-300" dateTime={entry.createdAt}>{formatGuestbookDate(entry.createdAt)}</time>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">{entry.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function formatGuestbookDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
