'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

type Photo = { id: string; fileUrl: string; caption: string | null; author: { nickname: string }; createdAt: string };
type Comment = { id: string; content: string; author: { nickname: string }; createdAt: string };
type Post = { id: string; content: string; author: { nickname: string }; createdAt: string; comments: Comment[] };

export function MeetingRecordBoard({ recordId, writable, closesAt, photos, posts }: { recordId: string; writable: boolean; closesAt: string; photos: Photo[]; posts: Post[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [post, setPost] = useState('');
  const [comment, setComment] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file?: File) => {
    if (!file || !writable) return;
    setBusy(true); setError(null);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const target = await apiFetch<{ uploadUrl: string; fileUrl: string; storageKey: string }>('/uploads/presigned-url', {
        method: 'POST', body: JSON.stringify({ contentType: file.type || 'image/jpeg', extension }),
      });
      const uploaded = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
      if (!uploaded.ok) throw new Error('upload failed');
      await apiFetch(`/meeting-records/${recordId}/photos`, { method: 'POST', body: JSON.stringify({ courseItemId: null, fileUrl: target.fileUrl, storageKey: target.storageKey, caption: caption.trim() || null }) });
      setCaption(''); router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '사진을 업로드하지 못했어요.');
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const addPost = async () => {
    if (!post.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/meeting-records/${recordId}/posts`, { method: 'POST', body: JSON.stringify({ courseItemId: null, content: post.trim() }) });
      setPost(''); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : '글을 등록하지 못했어요.'); }
    finally { setBusy(false); }
  };

  const addComment = async (postId: string) => {
    const content = comment[postId]?.trim(); if (!content || busy) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/meeting-records/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
      setComment((value) => ({ ...value, [postId]: '' })); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : '댓글을 등록하지 못했어요.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-8">
      <div className={writable ? 'rounded-2xl bg-accent-50 p-4 text-sm text-accent-700' : 'rounded-2xl bg-ink-50 p-4 text-sm text-ink-500'}>
        {writable ? `${new Date(closesAt).toLocaleString('ko-KR')}까지 사진과 글을 함께 남길 수 있어요.` : '기록 작성 기간이 끝났어요. 함께 남긴 추억은 계속 볼 수 있어요.'}
      </div>
      {error && <ErrorNotice message={error} />}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">함께 찍은 사진</h2><span className="text-sm text-ink-400">{photos.length}장</span></div>
        {writable && (
          <div className="mb-4 flex gap-2">
            <input className="field flex-1" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} placeholder="사진에 남길 한마디 (선택)" />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
            <button type="button" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-500 text-2xl font-light text-white shadow-card hover:bg-accent-600" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="사진 추가">+</button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          {photos.map((photo) => <button key={photo.id} type="button" onClick={() => setSelected(photo)} className="relative aspect-square overflow-hidden rounded-xl bg-ink-100"><Image src={photo.fileUrl} alt={photo.caption ?? '약속 사진'} fill unoptimized className="object-cover transition hover:scale-105" /></button>)}
        </div>
        {photos.length === 0 && <p className="rounded-2xl bg-white p-10 text-center text-sm text-ink-400">아직 등록된 사진이 없어요.</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold">우리의 이야기</h2>
        {writable && <div className="card mb-4 p-4"><textarea className="field min-h-24 resize-none" value={post} maxLength={2000} onChange={(e) => setPost(e.target.value)} placeholder="오늘의 기억을 글로 남겨주세요." /><div className="mt-2 flex justify-end"><button type="button" className="btn-primary" onClick={addPost} disabled={busy || !post.trim()}>게시</button></div></div>}
        <div className="space-y-4">
          {posts.map((item) => <article key={item.id} className="card overflow-hidden"><div className="border-b border-ink-100 px-4 py-3 font-bold">{item.author.nickname}</div><p className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-ink-700">{item.content}</p><div className="space-y-2 border-t border-ink-100 bg-ink-50/50 px-4 py-3">{item.comments.map((reply) => <p key={reply.id} className="text-sm"><strong className="mr-2">{reply.author.nickname}</strong><span className="text-ink-600">{reply.content}</span></p>)}{writable && <div className="flex gap-2 pt-1"><input className="field h-10 flex-1" value={comment[item.id] ?? ''} onChange={(e) => setComment((value) => ({ ...value, [item.id]: e.target.value }))} placeholder="댓글 달기..." /><button type="button" className="text-sm font-bold text-accent-600" onClick={() => addComment(item.id)}>게시</button></div>}</div></article>)}
        </div>
      </section>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white"><div className="relative h-[65vh] max-h-[680px] w-full bg-black"><Image src={selected.fileUrl} alt={selected.caption ?? '약속 사진'} fill unoptimized className="object-contain" /></div><div className="p-4"><strong>{selected.author.nickname}</strong>{selected.caption && <p className="mt-1 text-sm text-ink-600">{selected.caption}</p>}</div></div></div>}
    </div>
  );
}
