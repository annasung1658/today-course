import type { CourseItemCategory } from '@oneulcourse/core';


export function categoryLabel(category: CourseItemCategory): string {
  const labels: Record<CourseItemCategory, string> = {
    BREAKFAST: '아침식사',
    CAFE: '카페',
    LUNCH: '점심',
    DINNER: '저녁식사',
    WALK: '산책',
    EXHIBITION: '전시',
    ACTIVITY: '체험',
    SHOPPING: '쇼핑',
    BAR: '술집',
  };
  return labels[category];
}
