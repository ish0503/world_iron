import { MONTHS } from '../data/defs';

export function dateOf(startYear: number, day: number) {
  const year = startYear + Math.floor(day / 365);
  let d = day % 365;
  let m = 0;
  while (d >= MONTHS[m]) { d -= MONTHS[m]; m++; }
  return { year, month: m + 1, day: d + 1 };
}
export function fmtDate(startYear: number, day: number, withDay = true) {
  const t = dateOf(startYear, day);
  return withDay ? `${t.year}년 ${t.month}월 ${t.day}일` : `${t.year}년 ${t.month}월`;
}
export function isMonthStart(day: number) { return dateOf(0, day).day === 1; }
export function isYearStart(day: number) { return day % 365 === 0; }
export function season(month: number): { id: number; name: string } {
  if (month >= 3 && month <= 5) return { id: 0, name: '봄' };
  if (month >= 6 && month <= 8) return { id: 1, name: '여름' };
  if (month >= 9 && month <= 11) return { id: 2, name: '가을' };
  return { id: 3, name: '겨울' };
}
