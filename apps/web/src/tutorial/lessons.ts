import type { Lang } from '../i18n';

/** one thing to read, with examples to try or a tool to open */
export interface Step {
  text: string;
  /** lines added to the expression list by "Try it" */
  lines?: string[];
  /** a tool opened by the step's button */
  tool?: 'calc' | 'geo' | 'sheet';
}
export interface Lesson {
  id: string;
  title: string;
  steps: Step[];
}

const en: Lesson[] = [
  {
    id: 'typing',
    title: 'Typing math',
    steps: [
      { text: 'Type the way you write. ^ makes a power, / makes a fraction, _ a subscript. Press → to step out of a power or a fraction.', lines: ['3x^2 - 2x + 1', '(1/2 + 1/3)^2'] },
      { text: 'LaTeX names work without a backslash: alpha, theta, pi, sqrt, neq, approx, in, RR. A backslash command works too: \\frac, then Enter.', lines: ['sqrt(2) * pi', 'α + β'] },
      { text: 'Enter starts a new line. Ctrl+Z undoes, Alt+↑ and Alt+↓ move a line, and dragging a line’s number moves it too.' },
    ],
  },
  {
    id: 'graphs',
    title: 'Graphs',
    steps: [
      { text: 'Any line with x and y is drawn on the graph: functions, equations, inequalities, polar and parametric curves.', lines: ['y = x^2 - 2x', 'x^2 + y^2 = 9', 'y < sin(x)', 'r = 1 + cos(θ)'] },
      { text: 'Name a number and it gets a slider. Press play to watch the graph change; the slider icon sets its range and speed.', lines: ['a = 2', 'y = a sin(x)'] },
      { text: 'Click a line’s coloured dot for any colour, dashes, thickness or to hide it. Click a curve on the graph for its roots and turning points.' },
      { text: 'Graph settings switch to a polar grid or π on the x-axis and take a typed window. Shift+drag zooms to a box.' },
    ],
  },
  {
    id: 'exact',
    title: 'Exact answers',
    steps: [
      { text: 'Answers stay exact when they can: fractions, roots and π. Derivatives, integrals, limits and sums work as written.', lines: ['diff(x^3 sin(x), x)', 'integrate(x^2, x, 0, 3)', 'limit(sin(x)/x, x, 0)'] },
      { text: 'solve and factor work on equations and inequalities. Many answers have “Show steps”.', lines: ['solve(x^2 - 5x + 6 = 0)', 'factor(x^2 - 5x + 6)', 'solve(x^2 ≠ 4)'] },
      { text: 'A comparison with no unknowns answers True or False.', lines: ['2 + 2 = 4', '3 ≠ 3', '2^10 > 1000'] },
    ],
  },
  {
    id: 'names',
    title: 'Names and functions',
    steps: [
      { text: 'Give a value or a function a name and use it on any line below. const makes a name that can’t change.', lines: ['f(x) = x^2 + 1', 'f(3)', 'g(x) = f(x - 2)', 'const g0 = 9.81'] },
      { text: 'Matrices, complex numbers and statistics use the same names.', lines: ['M = [[1, 2], [3, 4]]', 'det(M)', 'mean([4, 8, 15, 16, 23, 42])'] },
    ],
  },
  {
    id: 'tables',
    title: 'Tables and fits',
    steps: [
      { text: 'Add → Table gives x and y columns; the points appear on the graph. The Fit buttons under a table add a regression line.' },
      { text: 'The same as lines:', lines: ['points([1, 2, 3, 4], [2.1, 3.9, 6.2, 7.8])', 'linreg([1, 2, 3, 4], [2.1, 3.9, 6.2, 7.8])'] },
      { text: 'Add → Note writes a sentence between lines; Add → Folder groups the lines under it, folds them away or hides them from the graph.' },
    ],
  },
  {
    id: 'tools',
    title: 'Calculator, Geometry, Study',
    steps: [
      { text: 'The Calculator tool works one line at a time with a large answer, exact or decimal, and ans for the last answer.', tool: 'calc' },
      { text: 'Geometry builds with points, segments, circles, midpoints, perpendiculars and more. Drag a point and everything built on it follows. The pen straightens a rough circle or triangle.', tool: 'geo' },
      { text: 'Study has practice at three levels, up to 평가원-style exam questions with points and full solutions. Its Worksheet side prints problem sheets; Generate problems fills one for you.', tool: 'sheet' },
    ],
  },
  {
    id: 'saving',
    title: 'Saving and sharing',
    steps: [
      { text: 'Your work is kept on this device and works offline. The folder icon saves graphs by name, opens them again and downloads them as files.' },
      { text: 'Share copies a link that holds the whole graph. The gear icon has the angle unit, theme, language and the keypad.' },
    ],
  },
];

const ko: Lesson[] = [
  {
    id: 'typing',
    title: '수식 입력',
    steps: [
      { text: '쓰듯이 입력하세요. ^는 거듭제곱, /는 분수, _는 아래 첨자입니다. →를 누르면 거듭제곱이나 분수에서 빠져나옵니다.', lines: ['3x^2 - 2x + 1', '(1/2 + 1/3)^2'] },
      { text: 'LaTeX 이름은 백슬래시 없이 됩니다: alpha, theta, pi, sqrt, neq, approx, in, RR. 백슬래시 명령도 됩니다: \\frac를 치고 Enter.', lines: ['sqrt(2) * pi', 'α + β'] },
      { text: 'Enter는 새 줄을 만듭니다. Ctrl+Z는 되돌리기, Alt+↑와 Alt+↓는 줄 옮기기이고, 줄 번호를 끌어도 옮겨집니다.' },
    ],
  },
  {
    id: 'graphs',
    title: '그래프',
    steps: [
      { text: 'x와 y가 들어간 줄은 그래프에 그려집니다: 함수, 방정식, 부등식, 극좌표와 매개변수 곡선.', lines: ['y = x^2 - 2x', 'x^2 + y^2 = 9', 'y < sin(x)', 'r = 1 + cos(θ)'] },
      { text: '수에 이름을 붙이면 슬라이더가 생깁니다. 재생을 누르면 그래프가 움직이고, 슬라이더 아이콘으로 범위와 속도를 정합니다.', lines: ['a = 2', 'y = a sin(x)'] },
      { text: '줄의 색 점을 누르면 색, 점선, 굵기, 숨기기를 고릅니다. 그래프의 곡선을 누르면 근과 극값을 보여 줍니다.' },
      { text: '그래프 설정에서 극좌표 격자, x축 π 눈금, 보기 범위를 정합니다. Shift를 누른 채 끌면 그 영역을 확대합니다.' },
    ],
  },
  {
    id: 'exact',
    title: '정확한 계산',
    steps: [
      { text: '답은 되도록 분수, 루트, π 그대로 나옵니다. 미분, 적분, 극한, 합도 쓰는 그대로 됩니다.', lines: ['diff(x^3 sin(x), x)', 'integrate(x^2, x, 0, 3)', 'limit(sin(x)/x, x, 0)'] },
      { text: 'solve와 factor는 방정식과 부등식에 씁니다. 많은 답에 “풀이 보기”가 있습니다.', lines: ['solve(x^2 - 5x + 6 = 0)', 'factor(x^2 - 5x + 6)', 'solve(x^2 ≠ 4)'] },
      { text: '모르는 값이 없는 비교는 참 또는 거짓으로 답합니다.', lines: ['2 + 2 = 4', '3 ≠ 3', '2^10 > 1000'] },
    ],
  },
  {
    id: 'names',
    title: '이름과 함수',
    steps: [
      { text: '값이나 함수에 이름을 붙이면 아래 줄 어디서든 씁니다. const는 바꿀 수 없는 이름입니다.', lines: ['f(x) = x^2 + 1', 'f(3)', 'g(x) = f(x - 2)', 'const g0 = 9.81'] },
      { text: '행렬, 복소수, 통계도 같은 방식으로 씁니다.', lines: ['M = [[1, 2], [3, 4]]', 'det(M)', 'mean([4, 8, 15, 16, 23, 42])'] },
    ],
  },
  {
    id: 'tables',
    title: '표와 회귀',
    steps: [
      { text: '추가 → 표를 누르면 x, y 열이 생기고 점이 그래프에 찍힙니다. 표 아래 회귀 버튼은 회귀선을 새 줄로 더합니다.' },
      { text: '줄로 쓰면 이렇습니다:', lines: ['points([1, 2, 3, 4], [2.1, 3.9, 6.2, 7.8])', 'linreg([1, 2, 3, 4], [2.1, 3.9, 6.2, 7.8])'] },
      { text: '추가 → 메모는 줄 사이에 글을 씁니다. 추가 → 폴더는 아래 줄을 묶고, 접거나 그래프에서 숨깁니다.' },
    ],
  },
  {
    id: 'tools',
    title: '계산기, 기하, 학습',
    steps: [
      { text: '계산기는 한 줄씩 계산하고 큰 화면에 정확한 값이나 소수로 보여 줍니다. ans는 마지막 답입니다.', tool: 'calc' },
      { text: '기하에서는 점, 선분, 원, 중점, 수선 등으로 작도합니다. 점을 끌면 그 점으로 만든 도형이 따라오고, 펜은 대충 그린 원이나 삼각형을 반듯하게 바꿉니다.', tool: 'geo' },
      { text: '학습에서는 기본, 심화, 평가원 스타일 세 난이도로 연습합니다. 평가원 스타일 문제는 배점과 해설이 있습니다. 학습지 쪽에서는 문제지를 인쇄하고, 문제 생성으로 한 번에 채울 수 있습니다.', tool: 'sheet' },
    ],
  },
  {
    id: 'saving',
    title: '저장과 공유',
    steps: [
      { text: '작업은 이 기기에 저장되고 인터넷 없이도 됩니다. 폴더 아이콘에서 그래프를 이름으로 저장하고, 다시 열고, 파일로 내려받습니다.' },
      { text: '공유는 그래프 전체를 담은 링크를 복사합니다. 톱니바퀴 아이콘에서 각도 단위, 테마, 언어, 키패드를 정합니다.' },
    ],
  },
];

export const LESSONS: Record<Lang, Lesson[]> = { en, ko };

export const TUTORIAL_STRINGS = {
  en: {
    intro: 'Short lessons. “Try it” adds the examples to your expression list.',
    progress: (done: number, all: number) => `${done} of ${all} done`,
    tryIt: 'Try it',
    added: (n: number) => `Added ${n} line${n === 1 ? '' : 's'}`,
    open: { calc: 'Open Calculator', geo: 'Open Geometry', sheet: 'Open Study' },
    markDone: 'Mark as done',
    done: 'Done',
    reset: 'Start over',
  },
  ko: {
    intro: '짧은 단원들입니다. “해 보기”를 누르면 예시가 식 목록에 추가됩니다.',
    progress: (done: number, all: number) => `${all}개 중 ${done}개 완료`,
    tryIt: '해 보기',
    added: (n: number) => `${n}줄을 추가했습니다`,
    open: { calc: '계산기 열기', geo: '기하 열기', sheet: '학습 열기' },
    markDone: '완료로 표시',
    done: '완료',
    reset: '처음부터',
  },
} satisfies Record<Lang, unknown>;
