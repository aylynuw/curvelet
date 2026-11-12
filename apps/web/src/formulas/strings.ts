import type { Lang } from '../i18n';
import type { Subject } from './library';

const en = {
  tab: 'Formulas',
  views: 'Show',
  library: 'Formulas',
  reference: 'Function reference',
  search: 'Search formulas',
  searchPlaceholder: 'Search: area, 속력, quadratic…',
  all: 'All',
  subjects: { algebra: 'Algebra', geometry: 'Geometry', trig: 'Trigonometry', calculus: 'Calculus', statistics: 'Statistics', physics: 'Physics' } as Record<Subject, string>,
  favorites: 'Favorites',
  recent: 'Recently used',
  everything: 'All formulas',
  none: 'No formula matches. Try another word, or clear the search.',
  favorite: (name: string) => `Favorite: ${name}`,
  open: (name: string) => `Fill in ${name}`,
  result: 'Result',
  working: 'Working it out…',
  insert: 'Insert into the worksheet',
  inserted: (name: string) => `${name} added. Change its values on the sliders.`,
  fnHint: 'a formula in x',
  graphNote: 'A graph: insert it to see it drawn.',

  words: 'Type in words',
  wordsPlaceholder: 'e.g. derivative of sin x squared',
  wordsReads: 'Reads as',
  wordsUnreadable: 'Couldn’t read that as math yet. Try “integral of x squared from 0 to 2” or “x^2-5x+6=0 풀어”.',
  wordsAdd: 'Add as a line',
};

export type FormulaStrings = typeof en;

const ko: FormulaStrings = {
  tab: '공식',
  views: '보기',
  library: '공식',
  reference: '함수 설명',
  search: '공식 찾기',
  searchPlaceholder: '찾기: 넓이, speed, 근의 공식…',
  all: '전체',
  subjects: { algebra: '대수', geometry: '도형', trig: '삼각법', calculus: '미적분', statistics: '통계', physics: '물리' },
  favorites: '즐겨찾기',
  recent: '최근에 쓴 공식',
  everything: '모든 공식',
  none: '맞는 공식이 없습니다. 다른 말로 찾거나 검색어를 지우세요.',
  favorite: (name) => `즐겨찾기: ${name}`,
  open: (name) => `${name} 값 넣기`,
  result: '결과',
  working: '계산하는 중…',
  insert: '작업지에 넣기',
  inserted: (name) => `${name}을(를) 넣었습니다. 슬라이더로 값을 바꿔 보세요.`,
  fnHint: 'x에 대한 식',
  graphNote: '그래프입니다. 넣으면 그래프에 그려집니다.',

  words: '말로 입력',
  wordsPlaceholder: '예: x제곱의 미분',
  wordsReads: '이렇게 읽었습니다',
  wordsUnreadable: '아직 수식으로 읽지 못했습니다. “0부터 2까지 x제곱 적분”이나 “solve x squared minus 4”처럼 써 보세요.',
  wordsAdd: '줄로 추가',
};

export const FORMULA_STRINGS: Record<Lang, FormulaStrings> = { en, ko };

const KEY = 'calculator.formulas.v1';

/** Favorites and recently used formulas, kept in the browser. */
export interface FormulaPrefs {
  favorites: string[];
  recent: string[];
}

export function loadPrefs(): FormulaPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { favorites: [], recent: [], ...(JSON.parse(raw) as Partial<FormulaPrefs>) };
  } catch {
    // blocked storage: start empty
  }
  return { favorites: [], recent: [] };
}

export function savePrefs(p: FormulaPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // keep them in memory
  }
}
