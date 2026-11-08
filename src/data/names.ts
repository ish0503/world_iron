const S1 = ['아르', '벨', '카', '에', '노', '바', '리', '테', '미', '라', '드', '산', '토', '엘', '하', '루', '세', '펠', '가', '조', '비', '타', '모', '시', '오', '유', '키', '도', '마', '네', '크', '파', '쥬', '헬', '이', '로', '사', '발', '갈', '다', '레', '보', '알', '자', '켈', '티', '프', '실', '울', '코'];
const S2 = ['덴', '로', '스', '리', '나', '온', '라', '미', '르', '델', '반', '테', '니', '카', '렌', '샤', '토', '란', '비', '도', '안', '엘', '마', '쿠', '벤', '젠', '루', '시', '탄', '베', '린', '고', '무', '레', '지'];
const S3 = ['아', '스', '니아', '드', '르', '온', '리아', '반', '탄', '가', '움', '헨', '디스', '란', '로스', '마르', '키아', '토르', '베아', '논'];
const GIVEN = ['알렉', '빅토르', '레온', '세라', '미하일', '이반', '엘레나', '카를', '오토', '루카', '마리아', '안톤', '헬가', '소피아', '테오', '니콜라', '아델', '구스타프', '이리나', '다리우스', '라파엘', '에밀', '클라라', '페드로', '유리', '하인츠', '마르코', '아나', '로만', '바실', '이사벨', '프란츠', '도리안', '세르게이', '엘리아스'];
const FAMILY = ['폰 베르크', '드라고미르', '카스텔', '노르딘', '바렌', '스트라츠', '헬름', '로젠', '말코프', '데 루카', '아이젠', '볼코프', '크라우스', '모렐', '산토스', '벨리아', '카렐', '오스트로', '레인', '다브로', '탈렌', '에르난', '그라츠', '바르도', '코발', '리히터', '베로나', '할데인'];
const PLACE_SUFFIX = ['', '', '', '하임', '그라드', '포르', '빌', '부르크', '스탄', '마르', '항', '성', '골', '곶', '평원', '고원'];
const CULT = ['인', '족', '계'];
const RELIG = ['교', '신앙', '교단', '정교', '신교'];

export type RandFn = () => number;
const pick = <T,>(r: RandFn, a: T[]) => a[Math.floor(r() * a.length)];

export function genRoot(r: RandFn): string {
  const n = r();
  if (n < 0.45) return pick(r, S1) + pick(r, S2);
  if (n < 0.85) return pick(r, S1) + pick(r, S2) + pick(r, S3);
  return pick(r, S1) + pick(r, S3);
}
export function genLeader(r: RandFn): string { return `${pick(r, GIVEN)} ${pick(r, FAMILY)}`; }
export function genPlace(r: RandFn): string {
  const root = r() < 0.5 ? pick(r, S1) + pick(r, S2) : pick(r, S2) + pick(r, S1) + pick(r, S2);
  return root + pick(r, PLACE_SUFFIX);
}
export function genCulture(r: RandFn, root: string): string { return root + pick(r, CULT); }
export function genReligion(r: RandFn): string { return pick(r, S1) + pick(r, S2) + pick(r, RELIG); }

const LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function genTag(r: RandFn, used: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const t = LAT[Math.floor(r() * 26)] + LAT[Math.floor(r() * 26)] + LAT[Math.floor(r() * 26)];
    if (!used.has(t)) { used.add(t); return t; }
  }
  return 'X' + used.size;
}

export function hslColor(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
