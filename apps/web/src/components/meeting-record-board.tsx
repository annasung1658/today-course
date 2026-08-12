'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ui';

type Photo = { id: string; fileUrl: string; caption: string | null; author: { nickname: string }; createdAt: string };
type Comment = { id: string; content: string; author: { nickname: string }; createdAt: string };
type Post = { id: string; content: string; author: { nickname: string }; createdAt: string; comments: Comment[] };

const ALLOWED_IMAGE_TYPES: Record<string, 'jpg' | 'jpeg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

export function MeetingRecordBoard({ recordId, writable, closesAt, photos, posts }: { recordId: string; writable: boolean; closesAt: string; photos: Photo[]; posts: Post[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [post, setPost] = useState('');
  const [comment, setComment] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Photo | null>(null);
  const [photoItems, setPhotoItems] = useState(photos);
  const [editingPhotos, setEditingPhotos] = useState(false);
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPhotoItems(photos), [photos]);

  const movePhoto = async (targetId: string) => {
    if (!draggedPhotoId || draggedPhotoId === targetId || busy) return;
    const previous = photoItems;
    const from = previous.findIndex((photo) => photo.id === draggedPhotoId);
    const to = previous.findIndex((photo) => photo.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...previous];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setPhotoItems(next);
    setDraggedPhotoId(null);
    setBusy(true); setError(null);
    try {
      await apiFetch(`/meeting-records/${recordId}/photos`, { method: 'PATCH', body: JSON.stringify({ photoIds: next.map((photo) => photo.id) }) });
      router.refresh();
    } catch (err) {
      setPhotoItems(previous);
      setError(err instanceof ApiClientError ? err.message : '사진 순서를 저장하지 못했어요.');
    } finally { setBusy(false); }
  };

  const deletePhoto = async (photo: Photo) => {
    if (busy || !window.confirm('이 사진을 삭제할까요? 삭제한 사진은 되돌릴 수 없어요.')) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/meeting-records/photos/${photo.id}`, { method: 'DELETE' });
      setPhotoItems((items) => items.filter((item) => item.id !== photo.id));
      if (selected?.id === photo.id) setSelected(null);
      router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : '사진을 삭제하지 못했어요.'); }
    finally { setBusy(false); }
  };

  const upload = async (file?: File) => {
    if (!file || !writable) return;
    const normalizedType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    const extension = ALLOWED_IMAGE_TYPES[normalizedType];
    if (!extension) {
      setError('JPG, JPEG, PNG, WebP 사진만 올릴 수 있어요.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('사진은 한 장당 15MB 이하로 올려주세요.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setBusy(true); setError(null);
    try {
      const target = await apiFetch<{ uploadUrl: string; fileUrl: string; storageKey: string }>('/uploads/presigned-url', {
        method: 'POST', body: JSON.stringify({ contentType: normalizedType, extension }),
      });
      const uploaded = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'Content-Type': normalizedType, 'x-upsert': 'false' }, body: file });
      if (!uploaded.ok) throw new Error(`upload failed (${uploaded.status})`);
      await apiFetch(`/meeting-records/${recordId}/photos`, { method: 'POST', body: JSON.stringify({ courseItemId: null, fileUrl: target.fileUrl, storageKey: target.storageKey, caption: caption.trim() || null }) });
      setCaption(''); router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '사진 저장소에 업로드하지 못했어요. 잠시 후 다시 시도해 주세요.');
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-extrabold">함께 찍은 사진</h2><p className="mt-0.5 text-xs text-ink-400">우리만의 순간을 한눈에 모아봐요.</p></div>
          <div className="flex items-center gap-2"><span className="text-sm text-ink-400">{photoItems.length}장</span>{writable && photoItems.length > 0 && <button type="button" className={editingPhotos ? 'rounded-full bg-ink-800 px-3 py-1.5 text-xs font-bold text-white' : 'rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-bold text-ink-600 hover:border-accent-300 hover:text-accent-600'} onClick={() => setEditingPhotos((value) => !value)}>{editingPhotos ? '완료' : '사진 편집'}</button>}</div>
        </div>
        {writable && (
          <div className="mb-4 flex gap-2">
            <input className="field flex-1" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} placeholder="사진에 남길 한마디 (선택)" />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
            <button type="button" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-500 text-2xl font-light text-white shadow-card hover:bg-accent-600" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="사진 추가">+</button>
          </div>
        )}
        {editingPhotos && <div className="mb-3 rounded-2xl bg-white/80 px-4 py-3 text-xs text-ink-500 shadow-sm"><strong className="text-ink-700">사진을 꾹 눌러 드래그</strong>하면 순서를 바꿀 수 있어요. 삭제는 사진 오른쪽 위 버튼을 눌러주세요.</div>}
        <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-1 overflow-hidden rounded-2xl bg-white p-1 shadow-card sm:gap-1.5 sm:p-1.5">
          {photoItems.map((photo, index) => <div key={photo.id} draggable={editingPhotos && !busy} onDragStart={() => setDraggedPhotoId(photo.id)} onDragEnd={() => setDraggedPhotoId(null)} onDragOver={(event) => editingPhotos && event.preventDefault()} onDrop={() => void movePhoto(photo.id)} className={`group relative aspect-square overflow-hidden bg-ink-100 transition ${editingPhotos ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${draggedPhotoId === photo.id ? 'scale-95 opacity-50' : ''}`}>
            <button type="button" className="absolute inset-0 z-0" onClick={() => !editingPhotos && setSelected(photo)} aria-label={`${index + 1}번째 사진 크게 보기`} />
            <Image src={photo.fileUrl} alt={photo.caption ?? '약속 사진'} fill unoptimized className={`pointer-events-none object-cover transition duration-300 ${editingPhotos ? 'scale-[0.97] brightness-90' : 'group-hover:scale-105'}`} />
            {!editingPhotos && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/45 to-transparent px-2 pb-2 pt-8 opacity-0 transition group-hover:opacity-100"><span className="text-xs font-semibold text-white">{index + 1}</span></div>}
            {editingPhotos && <><div className="pointer-events-none absolute left-2 top-2 z-20 flex h-7 min-w-7 items-center justify-center rounded-full bg-black/55 px-2 text-xs font-bold text-white backdrop-blur">{index + 1}</div><button type="button" onClick={(event) => { event.stopPropagation(); void deletePhoto(photo); }} className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-lg font-medium text-red-500 shadow-md transition hover:scale-105 hover:bg-red-50" aria-label="사진 삭제">×</button></>}
          </div>)}
        </div>
        {photoItems.length === 0 && <p className="rounded-2xl bg-white p-10 text-center text-sm text-ink-400">아직 등록된 사진이 없어요.</p>}
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
