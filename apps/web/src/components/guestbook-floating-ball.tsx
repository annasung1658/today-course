'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { BrandLogo } from '@/components/brand-logo';
import { ErrorNotice } from '@/components/ui';

interface GuestbookEntry {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; nickname: string; profileImageUrl: string | null };
}

export function GuestbookFloatingBall() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [content, setContent] = useState('');
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
        body: JSON.stringify({ content: message }),
      });
      setEntries((current) => [data.entry, ...current]);
      setContent('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '방명록을 남기지 못했어요.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-5 left-4 z-40 flex items-end gap-2 sm:bottom-7 sm:left-7">
        <button
          type="button"
          onClick={show}
          className="animate-bouncy-ball rounded-[1.35rem] border-4 border-white bg-white shadow-[0_14px_30px_rgba(47,146,229,.3)] transition hover:scale-105"
          aria-label="방명록 열기"
        >
          <BrandLogo size={58} decorative />
        </button>
        <button
          type="button"
          onClick={show}
          className="relative mb-4 rounded-2xl border border-accent-100 bg-white/95 px-4 py-2.5 text-sm font-extrabold text-accent-700 shadow-card backdrop-blur transition hover:-translate-y-0.5"
        >
          <span className="absolute -left-2 bottom-3 h-4 w-4 rotate-45 border-b border-l border-accent-100 bg-white" />
          <span className="relative">방명록에 남겨주세요!!</span>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_26px_80px_rgba(26,74,113,.28)]" role="dialog" aria-modal="true" aria-labelledby="guestbook-title">
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

            <form onSubmit={submit} className="border-b border-ink-100 p-4 sm:p-5">
              <textarea className="field min-h-24 resize-none" maxLength={300} value={content} onChange={(event) => setContent(event.target.value)} placeholder="오늘코스에 한마디 남겨주세요 :)" aria-label="방명록 내용" />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-ink-300">{content.length}/300</span>
                <button type="submit" className="btn-primary" disabled={!content.trim() || posting}>{posting ? '남기는 중' : '남기기'}</button>
              </div>
              {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
            </form>

            <div className="min-h-0 flex-1 overflow-y-auto bg-accent-50/40 p-4 sm:p-5">
              {loading ? (
                <p className="py-10 text-center text-sm text-ink-500">방명록을 펼치는 중이에요...</p>
              ) : entries.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-500">첫 번째 인사를 남겨주세요!</p>
              ) : (
                <ul className="space-y-3">
                  {entries.map((entry) => (
                    <li key={entry.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-ink-900">{entry.author.nickname}</span>
                        <time className="text-xs text-ink-300" dateTime={entry.createdAt}>{formatGuestbookDate(entry.createdAt)}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">{entry.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function formatGuestbookDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
