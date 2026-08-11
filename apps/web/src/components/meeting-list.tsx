'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeetingSummary } from '@/server/meeting-service';
import { MeetingCard } from '@/components/meeting-card';
import { EmptyState } from '@/components/ui';
import { apiFetch, ApiClientError } from '@/lib/api-client';

export function MeetingList({ meetings }: { meetings: MeetingSummary[] }) {
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = meetings.filter((meeting) => !['COMPLETED', 'CANCELLED'].includes(meeting.status));
  const past = meetings.filter((meeting) => ['COMPLETED', 'CANCELLED'].includes(meeting.status));

  const toggle = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const cancel = () => { setSelectionMode(false); setSelected([]); setError(null); };
  const removeSelected = async () => {
    if (selected.length === 0 || deleting) return;
    const targets = meetings.filter((meeting) => selected.includes(meeting.id));
    const hostCount = targets.filter((meeting) => meeting.isHost).length;
    const message = hostCount > 0
      ? `선택한 ${targets.length}개 약속을 삭제할까요? 이 중 방장인 ${hostCount}개 약속은 모든 참여자의 기록까지 실제 삭제돼요.`
      : `선택한 ${targets.length}개 약속을 내 목록에서 삭제할까요? 다른 참여자의 방과 기록은 유지돼요.`;
    if (!window.confirm(message)) return;
    setDeleting(true); setError(null);
    const results = await Promise.allSettled(targets.map((meeting) => apiFetch(`/meetings/${meeting.id}`, { method: 'DELETE' })));
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      const reason = failed[0]?.status === 'rejected' ? failed[0].reason : null;
      setError(reason instanceof ApiClientError ? reason.message : `${failed.length}개 약속을 삭제하지 못했어요.`);
      setDeleting(false);
    } else { cancel(); router.refresh(); }
  };

  return <div className="space-y-8">
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight">내 약속</h1>
      <div className="flex items-center gap-2">
        {selectionMode ? <>
          <button type="button" className="btn-secondary bg-ink-100" onClick={cancel} disabled={deleting}>취소</button>
          <button type="button" className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white disabled:bg-ink-200" onClick={removeSelected} disabled={selected.length === 0 || deleting}>{deleting ? '삭제 중' : `선택 삭제${selected.length ? ` ${selected.length}` : ''}`}</button>
        </> : <button type="button" className="btn-secondary border-ink-200 bg-ink-100 text-ink-600 hover:bg-ink-200" onClick={() => setSelectionMode(true)}>약속 삭제</button>}
        <Link href="/meetings/new" className="btn-primary">약속 만들기</Link>
      </div>
    </div>
    {selectionMode && <p className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink-500">삭제할 약속을 선택해 주세요. 방장은 전체 삭제, 참여자는 내 목록에서만 삭제돼요.</p>}
    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
    {active.length === 0 ? <EmptyState title="진행 중인 약속이 없어요" description="약속을 만들면 초대 링크가 생겨요. 카카오톡으로 공유해 보세요." action={<Link href="/meetings/new" className="btn-primary mt-1">약속 만들기</Link>} /> : <MeetingGrid meetings={active} selectionMode={selectionMode} selected={selected} toggle={toggle} />}
    {past.length > 0 && <section><h2 className="mb-3 text-sm font-semibold text-ink-500">지난 약속</h2><MeetingGrid meetings={past} selectionMode={selectionMode} selected={selected} toggle={toggle} /></section>}
  </div>;
}

function MeetingGrid({ meetings, selectionMode, selected, toggle }: { meetings: MeetingSummary[]; selectionMode: boolean; selected: string[]; toggle: (id: string) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">{meetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} selectionMode={selectionMode} selected={selected.includes(meeting.id)} onSelect={() => toggle(meeting.id)} />)}</div>;
}
