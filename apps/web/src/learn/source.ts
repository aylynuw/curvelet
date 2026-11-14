import type { Lang } from '../i18n';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A 평가원 problem's source, YYYYMMNN, written out: 2026년 11월 3번 / Nov 2026, No. 3 */
export function sourceText(code: string, lang: Lang): string {
  const year = code.slice(0, 4);
  const month = Number(code.slice(4, 6));
  const number = Number(code.slice(6, 8));
  return lang === 'ko' ? `${year}년 ${month}월 ${number}번` : `${MONTHS[month - 1] ?? month} ${year}, No. ${number}`;
}
