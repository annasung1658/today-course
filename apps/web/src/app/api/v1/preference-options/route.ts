import { route } from '@/lib/api/handler';

/** 화면에서 쓰는 선택지. 태그 값은 서버가 정의하고 클라이언트는 라벨만 표시한다. */
export const GET = route(async () => ({
  foods: [
    { value: 'KOREAN', label: '한식' },
    { value: 'JAPANESE', label: '일식' },
    { value: 'CHINESE', label: '중식' },
    { value: 'WESTERN', label: '양식' },
    { value: 'ASIAN', label: '아시안' },
    { value: 'SNACK', label: '분식' },
  ],
  activities: [
    { value: 'WALK', label: '산책' },
    { value: 'EXHIBITION', label: '전시' },
    { value: 'SHOPPING', label: '쇼핑' },
    { value: 'ACTIVITY', label: '체험·공방' },
    { value: 'CAFE', label: '카페' },
    { value: 'BAR', label: '술집' },
  ],
  atmospheres: [
    { value: 'QUIET', label: '조용한' },
    { value: 'CASUAL', label: '편안한' },
    { value: 'TRENDY', label: '트렌디한' },
    { value: 'SPECIAL', label: '특별한' },
  ],
  allergies: [
    { value: 'PEANUT', label: '땅콩' },
    { value: 'TREE_NUT', label: '견과류' },
    { value: 'SHELLFISH', label: '갑각류' },
    { value: 'DAIRY', label: '유제품' },
    { value: 'EGG', label: '계란' },
    { value: 'GLUTEN', label: '밀·글루텐' },
  ],
  mustHave: [
    { value: 'PET_FRIENDLY', label: '반려견 동반' },
    { value: 'STEP_FREE', label: '계단 없는 입구' },
    { value: 'PARKING', label: '주차 가능' },
    { value: 'PRIVATE_ROOM', label: '룸 있음' },
  ],
  mustAvoid: [
    { value: 'LONG_WAIT', label: '긴 웨이팅' },
    { value: 'CROWDED', label: '붐비는 곳' },
    { value: 'SPICY', label: '매운 음식' },
    { value: 'SMOKING', label: '흡연 가능 공간' },
  ],
  relationships: [
    { value: 'COUPLE', label: '연인' },
    { value: 'FAMILY', label: '가족' },
    { value: 'FRIENDS', label: '친구' },
    { value: 'COWORKERS', label: '회사' },
    { value: 'CLUB', label: '동호회' },
  ],
}));
