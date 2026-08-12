'use client';

import { useState } from 'react';

type Photo = { fileUrl: string; caption: string | null };
type Post = { content: string; author: { nickname: string }; comments: Array<{ content: string; author: { nickname: string } }> };

const WIDTH = 1080;
const HEIGHT = 1920;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  const lines: string[] = [];
  let line = '';
  for (const char of chars) {
    if (ctx.measureText(line + char).width > maxWidth && line) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) break;
    } else line += char;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && chars.join('').length > lines.join('').length) lines[maxLines - 1] = `${lines[maxLines - 1]?.slice(0, -1)}…`;
  return lines;
}

async function loadImage(src: string) {
  const response = await fetch(src);
  if (!response.ok) throw new Error('image fetch failed');
  const url = URL.createObjectURL(await response.blob());
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

export function RecordStoryShare({ title, dateLabel, photos, posts }: { title: string; dateLabel: string; photos: Photo[]; posts: Post[] }) {
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createStory = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');

    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#dff2ff'); gradient.addColorStop(0.52, '#f7fbff'); gradient.addColorStop(1, '#c8e7ff');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.beginPath(); ctx.arc(920, 170, 260, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(112,184,242,.12)'; ctx.beginPath(); ctx.arc(80, 1710, 310, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#2f92e5'; ctx.font = '800 34px system-ui, sans-serif'; ctx.letterSpacing = '8px'; ctx.fillText('ONEUL COURSE', 76, 110);
    ctx.fillStyle = '#111827'; ctx.font = '800 64px system-ui, sans-serif';
    wrapText(ctx, title, 920, 2).forEach((line, index) => ctx.fillText(line, 76, 205 + index * 76));
    ctx.fillStyle = '#65758b'; ctx.font = '500 30px system-ui, sans-serif'; ctx.fillText(`${dateLabel} · 우리의 지난 기록`, 78, 350);

    const images = (await Promise.all(photos.slice(0, 6).map(async (photo) => {
      try { return await loadImage(photo.fileUrl); } catch { return null; }
    }))).filter((image): image is HTMLImageElement => image !== null);
    const galleryY = 410; const galleryHeight = 850; const gap = 12; const galleryWidth = 928; const cellWidth = (galleryWidth - gap * 2) / 3; const cellHeight = (galleryHeight - gap) / 2;
    ctx.save(); roundedRect(ctx, 64, galleryY - 12, 952, galleryHeight + 24, 42); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillRect(64, galleryY - 12, 952, galleryHeight + 24);
    images.forEach((image, index) => cover(ctx, image, 76 + (index % 3) * (cellWidth + gap), galleryY + Math.floor(index / 3) * (cellHeight + gap), cellWidth, cellHeight));
    if (images.length === 0) {
      ctx.fillStyle = '#d9edfc'; ctx.fillRect(76, galleryY, galleryWidth, galleryHeight);
      ctx.fillStyle = '#5ca9e8'; ctx.font = '700 38px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('함께한 순간을 기억해요', WIDTH / 2, galleryY + galleryHeight / 2); ctx.textAlign = 'left';
    }
    ctx.restore();

    const memories = posts.flatMap((post) => [
      { nickname: post.author.nickname, content: post.content },
      ...post.comments.map((comment) => ({ nickname: comment.author.nickname, content: comment.content })),
    ]).filter((memory) => memory.content.trim()).slice(0, 3);
    let y = 1335;
    memories.forEach((memory) => {
      ctx.font = '700 25px system-ui, sans-serif';
      const lines = wrapText(ctx, memory.content, 790, 2);
      const boxHeight = 72 + lines.length * 36;
      ctx.fillStyle = 'rgba(255,255,255,.84)'; roundedRect(ctx, 76, y, 928, boxHeight, 30); ctx.fill();
      ctx.fillStyle = '#2f92e5'; ctx.fillText(memory.nickname, 108, y + 42);
      ctx.fillStyle = '#253247'; ctx.font = '500 25px system-ui, sans-serif'; lines.forEach((line, index) => ctx.fillText(line, 108, y + 82 + index * 36));
      y += boxHeight + 18;
    });
    ctx.fillStyle = '#66788e'; ctx.font = '600 25px system-ui, sans-serif'; ctx.fillText('오늘코스에서 함께 만든 우리의 추억', 76, 1830);
    ctx.fillStyle = '#2f92e5'; ctx.font = '800 29px system-ui, sans-serif'; ctx.fillText('oneulcourse-dev.vercel.app', 76, 1875);

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image encoding failed')), 'image/png'));
  };

  const openStory = async () => {
    setBusy(true); setError(null);
    try {
      const blob = await createStory();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch { setError('스토리 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };

  const shareOrDownload = async () => {
    if (!previewUrl) return;
    const blob = await (await fetch(previewUrl)).blob();
    const file = new File([blob], `${title || '오늘코스'}-추억.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${title}의 추억` });
      return;
    }
    const link = document.createElement('a'); link.href = previewUrl; link.download = file.name; link.click();
  };

  return <>
    <button type="button" onClick={() => void openStory()} disabled={busy} className="rounded-full border border-accent-200 bg-white px-4 py-2 text-sm font-bold text-accent-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card disabled:opacity-50">{busy ? '추억 카드 만드는 중…' : '스토리로 추억 공유'}</button>
    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    {previewUrl && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setPreviewUrl(null)}>
      <div className="w-full max-w-sm rounded-[2rem] bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between px-1"><div><p className="font-extrabold">추억 스토리</p><p className="text-xs text-ink-400">9:16 이미지로 만들었어요</p></div><button type="button" onClick={() => setPreviewUrl(null)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-50 text-xl text-ink-500">×</button></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="지난 약속 스토리 미리보기" className="mx-auto max-h-[68vh] rounded-2xl shadow-card" />
        <button type="button" onClick={() => void shareOrDownload()} className="btn-primary mt-4 w-full">모바일은 공유 · PC는 다운로드</button>
        <p className="mt-2 text-center text-xs text-ink-400">휴대폰 공유창에서 Instagram을 선택해 주세요.</p>
      </div>
    </div>}
  </>;
}
