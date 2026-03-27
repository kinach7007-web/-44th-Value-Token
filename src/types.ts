export interface User {
  id: string;
  name: string;
  balance: number;
  cumulativeValue: number;
  unconfirmedValue: number;
  level: number;
  avatar: string;
}

export interface Transaction {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
  timestamp: number;
  note: string;
  type: 'transfer' | 'reward' | 'system';
  confirmed?: boolean;
}

export const INITIAL_USERS: User[] = [
  { id: 'user-1', name: '서동국', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/seodongguk/100/100' },
  { id: 'user-2', name: '이현정', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/leehyunjung/100/100' },
  { id: 'user-3', name: '백승록', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/baekseungrok/100/100' },
  { id: 'user-4', name: '이진용', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/leejinyong/100/100' },
  { id: 'user-5', name: '고윤정', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/goyunjung/100/100' },
  { id: 'user-6', name: '정슬기', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/jungseulgi/100/100' },
  { id: 'user-7', name: '신다영', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/shindayoung/100/100' },
  { id: 'user-8', name: '김남철', balance: 100, cumulativeValue: 0, unconfirmedValue: 0, level: 1, avatar: 'https://picsum.photos/seed/kimnamchul/100/100' },
  { id: 'system', name: '시스템', balance: Infinity, cumulativeValue: 0, unconfirmedValue: 0, level: 5, avatar: 'https://picsum.photos/seed/system/100/100' },
];
