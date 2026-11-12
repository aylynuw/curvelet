import type { Lang } from '../i18n';

const en = {
  tools: 'Tool',
  graph: 'Graph',
  calculator: 'Calculator',
  geometry: 'Geometry',
  worksheet: 'Worksheet',
  input: 'Calculation',
  placeholder: 'Type a calculation',
  tape: 'Earlier calculations',
  emptyTape: 'Results stay here. Use ans for the last one.',
  format: 'Show as',
  exact: 'Exact',
  decimal: 'Decimal',
  ans: 'ans',
  ansLabel: 'Insert the last answer',
  copyLatex: 'Copy LaTeX',
  copied: 'LaTeX copied',
  copyFailed: 'Copying was blocked; select the text and copy it instead.',
  sendToGraph: 'Send to graph',
  sentToGraph: 'Added to the graph as a new line',
  openGraph: 'Open graph',
  clear: 'Clear tape',
  reuse: (src: string) => `Edit ${src} again`,
  waiting: 'Working it out…',
};

export type CalcStrings = typeof en;

const ko: CalcStrings = {
  tools: '도구',
  graph: '그래프',
  calculator: '계산기',
  geometry: '기하',
  worksheet: '학습지',
  input: '계산',
  placeholder: '계산식 입력',
  tape: '이전 계산',
  emptyTape: '결과가 여기에 남습니다. 마지막 결과는 ans로 씁니다.',
  format: '표시',
  exact: '정확한 값',
  decimal: '소수',
  ans: 'ans',
  ansLabel: '마지막 답 넣기',
  copyLatex: 'LaTeX 복사',
  copied: 'LaTeX를 복사했습니다',
  copyFailed: '복사가 막혔습니다. 텍스트를 선택해 직접 복사하세요.',
  sendToGraph: '그래프로 보내기',
  sentToGraph: '그래프에 새 줄로 추가했습니다',
  openGraph: '그래프 열기',
  clear: '기록 지우기',
  reuse: (src: string) => `${src} 다시 고치기`,
  waiting: '계산하는 중…',
};

export const CALC: Record<Lang, CalcStrings> = { en, ko };
