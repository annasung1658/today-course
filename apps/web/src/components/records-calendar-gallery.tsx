'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BrandLogo } from '@/components/brand-logo';

type RecordPreview = {
  recordId: string | null;
  meetingId: string;
  title: string;
  photos: Array<{ id: string; fileUrl: string }>;
  photoCount: number;
  postCount: number;
};

type CalendarData = {
  year: number;
  month: number;
  dates: Array<{ date: string; recordCount: number; records: RecordPreview[] }>;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function monthLink(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `/records?year=${date.getUTCFullYear()}&month=${date.getUTCMonth() + 1}`;
}

function PhotoPreview({ record }: { record: RecordPreview }) {
  if (record.photos.length === 0) {
    return (
      <div className="flex aspect-[16/8] items-center justify-center rounded-[22px] border border-white/80 bg-gradient-to-br from-sky-50 via-white to-blue-100">
        <div className="text-center">
          <BrandLogo size={46} decorative className="mx-auto mb-2 opacity-70 shadow-sm" />
          <p className="text-sm font-semibold text-ink-400">아직 남겨진 사진이 없어요</p>
          <p className="mt-1 text-xs text-ink-300">그날의 이야기부터 만나보세요</p>
        </div>
      </div>
    );
  }

  const photos = record.photos.slice(0, 3);
  return (
    <div className={`grid aspect-[16/8] overflow-hidden rounded-[22px] bg-sky-50 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-1`}>
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          className={`bg-cover bg-center ${photos.length === 3 && index === 0 ? 'row-span-2' : ''}`}
          style={{ backgroundImage: `url(${JSON.stringify(photo.fileUrl).slice(1, -1)})` }}
          role="img"
          aria-label={`${record.title} 기록 사진 ${index + 1}`}
        />
      ))}
    </div>
  );
}

export function RecordsCalendarGallery({ calendar }: { calendar: CalendarData }) {
  const recordByDate = useMemo(() => new Map(calendar.dates.map((item) => [item.date, item])), [calendar.dates]);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const fallbackDay = calendar.year === today.getFullYear() && calendar.month === today.getMonth() + 1 ? today.getDate() : 1;
  const firstRecordDay = calendar.dates[0] ? Number(calendar.dates[0].date.slice(-2)) : fallbackDay;
  const [selectedDay, setSelectedDay] = useState(firstRecordDay);
  const daysInMonth = new Date(Date.UTC(calendar.year, calendar.month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(calendar.year, calendar.month - 1, 1)).getUTCDay();
  const selectedKey = `${calendar.year}-${String(calendar.month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const selected = recordByDate.get(selectedKey);
  const selectedWeekday = WEEKDAYS[new Date(`${selectedKey}T00:00:00+09:00`).getDay()];

  return (
    <section className="space-y-7">
      <div>
        <p className="text-sm font-semibold text-sky-500">OUR MEMORIES</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">지난 기록을 다시 꺼내봐요</h1>
        <p className="mt-2 text-sm text-ink-400">날짜를 누르면 함께 남긴 사진과 이야기를 볼 수 있어요.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(330px,0.8fr)_minmax(0,1.35fr)]">
        <div className="sticky top-24 overflow-hidden rounded-[32px] border border-white/90 bg-white/55 p-5 shadow-[0_24px_70px_rgba(58,145,220,.14)] backdrop-blur-xl sm:p-7 lg:sticky">
          <div className="mb-6 flex items-center justify-between">
            <Link href={monthLink(calendar.year, calendar.month, -1)} className="grid h-10 w-10 place-items-center rounded-full bg-white/80 text-xl text-ink-500 shadow-sm transition hover:-translate-x-0.5" aria-label="이전 달">‹</Link>
            <div className="text-center">
              <p className="text-xs font-semibold tracking-[.18em] text-sky-500">MEMORY CALENDAR</p>
              <h2 className="mt-1 text-xl font-bold">{calendar.year}. {String(calendar.month).padStart(2, '0')}</h2>
            </div>
            <Link href={monthLink(calendar.year, calendar.month, 1)} className="grid h-10 w-10 place-items-center rounded-full bg-white/80 text-xl text-ink-500 shadow-sm transition hover:translate-x-0.5" aria-label="다음 달">›</Link>
          </div>

          <div className="grid grid-cols-7 text-center text-xs font-semibold text-ink-300">
            {WEEKDAYS.map((day, index) => <div key={day} className={index === 0 ? 'text-rose-400' : ''}>{day}</div>)}
          </div>
          <div className="mt-3 grid grid-cols-7 gap-y-2 text-center">
            {Array.from({ length: firstWeekday }).map((_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
              const key = `${calendar.year}-${String(calendar.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasRecord = recordByDate.has(key);
              const isSelected = selectedDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`relative mx-auto grid h-11 w-11 place-items-center rounded-full text-sm font-semibold transition ${isSelected ? 'scale-105 bg-sky-500 text-white shadow-[0_8px_22px_rgba(47,146,229,.35)]' : 'text-ink-600 hover:bg-white/90'} ${key === todayKey && !isSelected ? 'ring-1 ring-sky-300' : ''}`}
                  aria-label={`${calendar.month}월 ${day}일${hasRecord ? ', 기록 있음' : ''}`}
                >
                  {day}
                  {hasRecord && <span className={`absolute bottom-1.5 h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-sky-500'}`} />}
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-full bg-sky-50/80 px-4 py-2 text-xs text-ink-400">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> 점이 있는 날에 추억이 있어요
          </div>
        </div>

        <div className="min-h-[520px] rounded-[32px] border border-white/90 bg-white/42 p-5 shadow-[0_24px_70px_rgba(58,145,220,.1)] backdrop-blur-md sm:p-7">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-sky-500">{calendar.month}월 {selectedDay}일 {selectedWeekday}요일</p>
              <h2 className="mt-1 text-xl font-bold">이날의 약속</h2>
            </div>
            {selected && <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-ink-400">{selected.recordCount}개의 기록</span>}
          </div>

          {!selected ? (
            <div className="flex min-h-[390px] items-center justify-center rounded-[26px] border border-dashed border-sky-200 bg-gradient-to-br from-white/70 to-sky-50/70 text-center">
              <div>
                <span className="text-4xl" aria-hidden>☁️</span>
                <p className="mt-4 font-semibold text-ink-500">이날은 아직 기록이 없어요</p>
                <p className="mt-1 text-sm text-ink-300">점이 표시된 날짜를 눌러 추억을 열어보세요.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-5">
              {selected.records.map((record) => (
                <li key={record.meetingId} className="rounded-[28px] border border-white bg-white/85 p-4 shadow-[0_14px_36px_rgba(42,107,160,.1)] sm:p-5">
                  <PhotoPreview record={record} />
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold">{record.title}</h3>
                      <p className="mt-1 text-xs text-ink-300">사진 {record.photoCount}장 · 이야기 {record.postCount}개</p>
                    </div>
                    <Link href={`/meetings/${record.meetingId}/record`} className="btn-primary whitespace-nowrap text-center">자세히 보기</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
