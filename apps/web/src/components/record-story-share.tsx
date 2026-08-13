'use client';

import { useState } from 'react';

type Photo = { fileUrl: string; caption: string | null };
type Post = { content: string; author: { nickname: string }; comments: Array<{ content: string; author: { nickname: string } }> };
type FrameKey = 'white-dot' | 'mono' | 'black' | 'sky-dot' | 'pink' | 'check';

const FRAMES: Array<{ key: FrameKey; label: string; preview: string; ink: string; muted: string; accent: string; card: string }> = [
  { key: 'white-dot', label: '화이트 도트', preview: 'radial-gradient(#b9c6d2 1px,white 1px)', ink: '#17202b', muted: '#64748b', accent: '#69aee7', card: 'rgba(255,255,255,.9)' },
  { key: 'mono', label: '모노톤', preview: 'linear-gradient(135deg,#f4f4f4 50%,#dedede 50%)', ink: '#191919', muted: '#6b6b6b', accent: '#555555', card: 'rgba(255,255,255,.88)' },
  { key: 'black', label: '블랙', preview: '#171717', ink: '#ffffff', muted: '#bdbdbd', accent: '#91cfff', card: 'rgba(255,255,255,.12)' },
  { key: 'sky-dot', label: '하늘 도트', preview: 'radial-gradient(#79bff1 1px,#dff2ff 1px)', ink: '#142a3b', muted: '#5c7890', accent: '#2f92e5', card: 'rgba(255,255,255,.82)' },
  { key: 'pink', label: '연핑크', preview: 'linear-gradient(135deg,#fff4f7,#ffdce7)', ink: '#3f2730', muted: '#916b78', accent: '#ee86aa', card: 'rgba(255,255,255,.82)' },
  { key: 'check', label: '잔체크', preview: 'conic-gradient(#dce9f3 25%,white 0 50%,#dce9f3 0 75%,white 0)', ink: '#263746', muted: '#6b7e8e', accent: '#568bb5', card: 'rgba(255,255,255,.88)' },
];

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

function paintFrame(ctx: CanvasRenderingContext2D, frame: FrameKey) {
  const solid: Record<FrameKey, string> = {
    'white-dot': '#fafafa', mono: '#e7e7e7', black: '#151515', 'sky-dot': '#dff2ff', pink: '#ffe8ef', check: '#f8fbfd',
  };
  ctx.fillStyle = solid[frame]; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (frame === 'white-dot' || frame === 'sky-dot') {
    ctx.fillStyle = frame === 'white-dot' ? '#c7d0d8' : '#93c9ed';
    for (let y = 18; y < HEIGHT; y += 34) for (let x = 18; x < WIDTH; x += 34) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (frame === 'mono') {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT); gradient.addColorStop(0, '#f7f7f7'); gradient.addColorStop(.55, '#dedede'); gradient.addColorStop(1, '#f4f4f4'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else if (frame === 'pink') {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT); gradient.addColorStop(0, '#fff7f9'); gradient.addColorStop(.5, '#ffe2eb'); gradient.addColorStop(1, '#ffd3e1'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(900, 170, 250, 0, Math.PI * 2); ctx.fill();
  } else if (frame === 'check') {
    ctx.strokeStyle = '#d9e6ef'; ctx.lineWidth = 2;
    for (let x = 0; x <= WIDTH; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 0; y <= HEIGHT; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }
  }
}

export function RecordStoryShare({ title, dateLabel, photos, posts }: { title: string; dateLabel: string; photos: Photo[]; posts: Post[] }) {
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState<FrameKey>('sky-dot');

  const createStory = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');

    const frame = FRAMES.find((item) => item.key === frameKey) ?? FRAMES[3]!;
    paintFrame(ctx, frame.key);

    const dateMatch = dateLabel.match(/(\d{1,2})월\s*(\d{1,2})일/);
    const shortDate = dateMatch ? `${Number(dateMatch[1])}월 ${Number(dateMatch[2])}일` : dateLabel;
    try {
      const logo = await loadImage('/today-course-logo.png');
      ctx.fillStyle = 'rgba(255,255,255,.88)'; roundedRect(ctx, 58, 54, 92, 92, 24); ctx.fill();
      cover(ctx, logo, 65, 61, 78, 78);
    } catch { /* 로고 로딩에 실패해도 스토리는 생성한다. */ }
    ctx.fillStyle = frame.muted; ctx.font = '600 25px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(shortDate, 170, 91);
    ctx.textAlign = 'center';
    ctx.fillStyle = frame.ink; ctx.font = '800 62px system-ui, sans-serif';
    wrapText(ctx, title, 760, 2).forEach((line, index) => ctx.fillText(line, WIDTH / 2, 200 + index * 70));
    ctx.textAlign = 'left';

    const images = (await Promise.all(photos.slice(0, 9).map(async (photo) => {
      try { return await loadImage(photo.fileUrl); } catch { return null; }
    }))).filter((image): image is HTMLImageElement => image !== null);
    const galleryY = 365; const galleryHeight = 928; const gap = 10; const galleryWidth = 928; const cellWidth = (galleryWidth - gap * 2) / 3; const cellHeight = cellWidth;
    ctx.save(); roundedRect(ctx, 64, galleryY - 12, 952, galleryHeight + 24, 42); ctx.clip();
    ctx.fillStyle = frame.card; ctx.fillRect(64, galleryY - 12, 952, galleryHeight + 24);
    images.forEach((image, index) => cover(ctx, image, 76 + (index % 3) * (cellWidth + gap), galleryY + Math.floor(index / 3) * (cellHeight + gap), cellWidth, cellHeight));
    if (images.length === 0) {
      ctx.fillStyle = '#d9edfc'; ctx.fillRect(76, galleryY, galleryWidth, galleryHeight);
      ctx.fillStyle = '#5ca9e8'; ctx.font = '700 38px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('함께한 순간을 기억해요', WIDTH / 2, galleryY + galleryHeight / 2); ctx.textAlign = 'left';
    }
    ctx.restore();

    const memories = posts.flatMap((post) => [
      { nickname: post.author.nickname, content: post.content },
      ...post.comments.map((comment) => ({ nickname: comment.author.nickname, content: comment.content })),
    ]).filter((memory) => memory.content.trim()).slice(0, 2);
    let y = 1350;
    memories.forEach((memory) => {
      ctx.font = '700 25px system-ui, sans-serif';
      const lines = wrapText(ctx, memory.content, 790, 2);
      const boxHeight = 68 + lines.length * 34;
      ctx.fillStyle = frame.card; roundedRect(ctx, 76, y, 928, boxHeight, 30); ctx.fill();
      ctx.fillStyle = frame.accent; ctx.fillText(memory.nickname, 108, y + 39);
      ctx.fillStyle = frame.ink; ctx.font = '500 25px system-ui, sans-serif'; lines.forEach((line, index) => ctx.fillText(line, 108, y + 76 + index * 34));
      y += boxHeight + 18;
    });
    ctx.fillStyle = frame.muted; ctx.font = '600 25px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('오늘코스에서 함께 만든 우리의 추억', WIDTH / 2, 1845);

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

  return <div className="flex flex-col items-end gap-3">
    <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl bg-white/70 p-2 shadow-sm" aria-label="스토리 프레임 선택">
      {FRAMES.map((frame) => <button key={frame.key} type="button" onClick={() => { setFrameKey(frame.key); setPreviewUrl(null); }} className={`group flex shrink-0 flex-col items-center gap-1 rounded-xl p-1.5 transition ${frameKey === frame.key ? 'bg-accent-50 ring-2 ring-accent-400' : 'hover:bg-ink-50'}`} aria-pressed={frameKey === frame.key}>
        <span className="h-8 w-8 rounded-lg border border-black/10 shadow-sm" style={{ background: frame.preview, backgroundSize: frame.key === 'check' ? '12px 12px' : frame.key.includes('dot') ? '9px 9px' : undefined }} />
        <span className="text-[10px] font-semibold text-ink-500">{frame.label}</span>
      </button>)}
    </div>
    <button type="button" onClick={() => void openStory()} disabled={busy} className="rounded-full border border-accent-200 bg-white px-4 py-2 text-sm font-bold text-accent-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card disabled:opacity-50">{busy ? '추억 카드 만드는 중…' : '선택한 프레임으로 공유'}</button>
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
  </div>;
}
