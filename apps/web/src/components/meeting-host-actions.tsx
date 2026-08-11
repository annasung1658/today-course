'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

export function MeetingHostActions({ meeting }: { meeting: { id: string; title: string; capacity: number; specialNotes: string | null } }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(meeting.title);
  const [capacity, setCapacity] = useState(meeting.capacity);
  const [specialNotes, setSpecialNotes] = useState(meeting.specialNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await apiFetch(`/meetings/${meeting.id}`, { method: 'PATCH', body: JSON.stringify({ title, capacity, specialNotes: specialNotes || null }) });
      setEditing(false); router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '약속을 수정하지 못했어요.');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('이 약속을 정말 삭제할까요? 사진, 글, 댓글도 모두 삭제되며 되돌릴 수 없어요.')) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/meetings/${meeting.id}`, { method: 'DELETE' });
      router.push('/meetings'); router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '약속을 삭제하지 못했어요.');
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>방 수정</button>
        <button type="button" className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50" onClick={remove} disabled={busy}>방 삭제</button>
      </div>
      {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && setEditing(false)}>
          <section className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-[0_28px_90px_rgba(18,54,82,.35)]" role="dialog" aria-modal="true" aria-labelledby="meeting-edit-title">
            <h2 id="meeting-edit-title" className="text-xl font-extrabold">약속방 수정</h2>
            <label className="label mt-5" htmlFor="meeting-title">약속 이름</label>
            <input id="meeting-title" className="field" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
            <label className="label mt-4" htmlFor="meeting-capacity">참여 인원</label>
            <input id="meeting-capacity" className="field" type="number" min={2} max={20} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            <label className="label mt-4" htmlFor="meeting-notes">미리 알려둘 점</label>
            <textarea id="meeting-notes" className="field min-h-24 resize-none" maxLength={1000} value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} />
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>취소</button>
              <button type="button" className="btn-primary" disabled={busy || !title.trim()} onClick={save}>{busy ? '저장 중' : '저장'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
