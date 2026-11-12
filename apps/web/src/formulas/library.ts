import type { Lang } from '../i18n';

export type Subject = 'algebra' | 'geometry' | 'trig' | 'calculus' | 'statistics' | 'physics';
export const SUBJECTS: Subject[] = ['algebra', 'geometry', 'trig', 'calculus', 'statistics', 'physics'];

/**
 * A formula you fill in. Each input becomes a `let` line (a number, so a
 * slider, or a function); the result is the last line. Names are in the
 * calculator's syntax (v_0, θ); `formula` is how it is shown.
 */
export interface Formula {
  id: string;
  subject: Subject;
  name: Record<Lang, string>;
  /** shown typeset, in calculator syntax: A = pi r^2 */
  formula: string;
  inputs: { name: string; value: string; note: Record<Lang, string>; fn?: boolean }[];
  /** the line that computes the result */
  result: string;
  unit?: string;
}

const t = (en: string, ko: string): Record<Lang, string> => ({ en, ko });

export const FORMULAS: Formula[] = [
  // ---------- algebra
  {
    id: 'quadratic', subject: 'algebra', name: t('Quadratic formula', '근의 공식'), formula: 'x = (-b + sqrt(b^2 - 4a c))/(2a)',
    inputs: [{ name: 'a', value: '1', note: t('x² coefficient', 'x²의 계수') }, { name: 'b', value: '-5', note: t('x coefficient', 'x의 계수') }, { name: 'c', value: '6', note: t('constant', '상수항') }],
    result: 'solve(a x^2 + b x + c = 0, x)',
  },
  {
    id: 'discriminant', subject: 'algebra', name: t('Discriminant', '판별식'), formula: 'D = b^2 - 4a c',
    inputs: [{ name: 'a', value: '1', note: t('x² coefficient', 'x²의 계수') }, { name: 'b', value: '2', note: t('x coefficient', 'x의 계수') }, { name: 'c', value: '-3', note: t('constant', '상수항') }],
    result: 'let D = b^2 - 4a c',
  },
  {
    id: 'slope', subject: 'algebra', name: t('Slope through two points', '두 점을 지나는 직선의 기울기'), formula: 'm = (y_2 - y_1)/(x_2 - x_1)',
    inputs: [{ name: 'x_1', value: '1', note: t('first x', '첫 점의 x') }, { name: 'y_1', value: '2', note: t('first y', '첫 점의 y') }, { name: 'x_2', value: '4', note: t('second x', '둘째 점의 x') }, { name: 'y_2', value: '8', note: t('second y', '둘째 점의 y') }],
    result: 'let m = (y_2 - y_1)/(x_2 - x_1)',
  },
  {
    id: 'arith-term', subject: 'algebra', name: t('Arithmetic sequence: nth term', '등차수열의 일반항'), formula: 'a_n = a + (n - 1)d',
    inputs: [{ name: 'a', value: '3', note: t('first term', '첫째항') }, { name: 'd', value: '4', note: t('common difference', '공차') }, { name: 'n', value: '10', note: t('which term', '몇째 항') }],
    result: 'let a_n = a + (n - 1)d',
  },
  {
    id: 'arith-sum', subject: 'algebra', name: t('Arithmetic series: sum', '등차수열의 합'), formula: 'S_n = n(2a + (n - 1)d)/2',
    inputs: [{ name: 'a', value: '3', note: t('first term', '첫째항') }, { name: 'd', value: '4', note: t('common difference', '공차') }, { name: 'n', value: '10', note: t('number of terms', '항의 개수') }],
    result: 'let S_n = n(2a + (n - 1)d)/2',
  },
  {
    id: 'geo-term', subject: 'algebra', name: t('Geometric sequence: nth term', '등비수열의 일반항'), formula: 'a_n = a r^(n - 1)',
    inputs: [{ name: 'a', value: '2', note: t('first term', '첫째항') }, { name: 'r', value: '3', note: t('common ratio', '공비') }, { name: 'n', value: '5', note: t('which term', '몇째 항') }],
    result: 'let a_n = a r^(n - 1)',
  },
  {
    id: 'geo-sum', subject: 'algebra', name: t('Geometric series: sum', '등비수열의 합'), formula: 'S_n = a(1 - r^n)/(1 - r)',
    inputs: [{ name: 'a', value: '2', note: t('first term', '첫째항') }, { name: 'r', value: '3', note: t('common ratio (not 1)', '공비(1이 아님)') }, { name: 'n', value: '5', note: t('number of terms', '항의 개수') }],
    result: 'let S_n = a(1 - r^n)/(1 - r)',
  },
  {
    id: 'compound', subject: 'algebra', name: t('Compound interest', '복리'), formula: 'A = P(1 + r/k)^(k t)',
    inputs: [{ name: 'P', value: '1000', note: t('starting amount', '원금') }, { name: 'r', value: '0.05', note: t('yearly rate (0.05 = 5%)', '연이율(0.05 = 5%)') }, { name: 'k', value: '12', note: t('times a year', '1년에 붙는 횟수') }, { name: 't', value: '10', note: t('years', '기간(년)') }],
    result: 'let A = P(1 + r/k)^(k t)',
  },
  // ---------- geometry
  {
    id: 'distance', subject: 'geometry', name: t('Distance between two points', '두 점 사이의 거리'), formula: 'd = sqrt((x_2 - x_1)^2 + (y_2 - y_1)^2)',
    inputs: [{ name: 'x_1', value: '0', note: t('first x', '첫 점의 x') }, { name: 'y_1', value: '0', note: t('first y', '첫 점의 y') }, { name: 'x_2', value: '3', note: t('second x', '둘째 점의 x') }, { name: 'y_2', value: '4', note: t('second y', '둘째 점의 y') }],
    result: 'let d = sqrt((x_2 - x_1)^2 + (y_2 - y_1)^2)',
  },
  {
    id: 'midpoint', subject: 'geometry', name: t('Midpoint', '중점'), formula: 'M = ((x_1 + x_2)/2, (y_1 + y_2)/2)',
    inputs: [{ name: 'x_1', value: '-2', note: t('first x', '첫 점의 x') }, { name: 'y_1', value: '1', note: t('first y', '첫 점의 y') }, { name: 'x_2', value: '4', note: t('second x', '둘째 점의 x') }, { name: 'y_2', value: '5', note: t('second y', '둘째 점의 y') }],
    result: 'let M = ((x_1 + x_2)/2, (y_1 + y_2)/2)',
  },
  {
    id: 'pythagoras', subject: 'geometry', name: t('Pythagorean theorem', '피타고라스 정리'), formula: 'c = sqrt(a^2 + b^2)',
    inputs: [{ name: 'a', value: '3', note: t('one leg', '한 변') }, { name: 'b', value: '4', note: t('other leg', '다른 변') }],
    result: 'let c = sqrt(a^2 + b^2)',
  },
  {
    id: 'circle-area', subject: 'geometry', name: t('Area of a circle', '원의 넓이'), formula: 'A = pi r^2',
    inputs: [{ name: 'r', value: '3', note: t('radius', '반지름') }],
    result: 'let A = pi r^2',
  },
  {
    id: 'circumference', subject: 'geometry', name: t('Circumference', '원의 둘레'), formula: 'C = 2pi r',
    inputs: [{ name: 'r', value: '3', note: t('radius', '반지름') }],
    result: 'let C = 2pi r',
  },
  {
    id: 'sector', subject: 'geometry', name: t('Sector: arc and area', '부채꼴의 호와 넓이'), formula: 'S = r^2 θ/2',
    inputs: [{ name: 'r', value: '4', note: t('radius', '반지름') }, { name: 'θ', value: 'pi/3', note: t('angle in radians', '중심각(라디안)') }],
    result: 'let S = r^2 θ/2',
  },
  {
    id: 'triangle', subject: 'geometry', name: t('Area of a triangle', '삼각형의 넓이'), formula: 'A = b h/2',
    inputs: [{ name: 'b', value: '6', note: t('base', '밑변') }, { name: 'h', value: '4', note: t('height', '높이') }],
    result: 'let A = b h/2',
  },
  {
    id: 'heron', subject: 'geometry', name: t("Heron's formula", '헤론의 공식'), formula: 'A = sqrt(s(s - a)(s - b)(s - c))',
    inputs: [{ name: 'a', value: '5', note: t('side', '변') }, { name: 'b', value: '6', note: t('side', '변') }, { name: 'c', value: '7', note: t('side', '변') }],
    result: 'let A = sqrt((a + b + c)/2 ((a + b + c)/2 - a)((a + b + c)/2 - b)((a + b + c)/2 - c))',
  },
  {
    id: 'trapezoid', subject: 'geometry', name: t('Area of a trapezoid', '사다리꼴의 넓이'), formula: 'A = (a + b)h/2',
    inputs: [{ name: 'a', value: '3', note: t('top side', '윗변') }, { name: 'b', value: '7', note: t('bottom side', '아랫변') }, { name: 'h', value: '4', note: t('height', '높이') }],
    result: 'let A = (a + b)h/2',
  },
  {
    id: 'sphere', subject: 'geometry', name: t('Volume of a sphere', '구의 부피'), formula: 'V = 4/3 pi r^3',
    inputs: [{ name: 'r', value: '3', note: t('radius', '반지름') }],
    result: 'let V = 4/3 pi r^3',
  },
  {
    id: 'sphere-area', subject: 'geometry', name: t('Surface area of a sphere', '구의 겉넓이'), formula: 'S = 4pi r^2',
    inputs: [{ name: 'r', value: '3', note: t('radius', '반지름') }],
    result: 'let S = 4pi r^2',
  },
  {
    id: 'cylinder', subject: 'geometry', name: t('Volume of a cylinder', '원기둥의 부피'), formula: 'V = pi r^2 h',
    inputs: [{ name: 'r', value: '2', note: t('radius', '반지름') }, { name: 'h', value: '5', note: t('height', '높이') }],
    result: 'let V = pi r^2 h',
  },
  {
    id: 'cone', subject: 'geometry', name: t('Volume of a cone', '원뿔의 부피'), formula: 'V = pi r^2 h/3',
    inputs: [{ name: 'r', value: '2', note: t('radius', '반지름') }, { name: 'h', value: '5', note: t('height', '높이') }],
    result: 'let V = pi r^2 h/3',
  },
  // ---------- trigonometry
  {
    id: 'cosines', subject: 'trig', name: t('Law of cosines', '코사인 법칙'), formula: 'c = sqrt(a^2 + b^2 - 2a b cos(C))',
    inputs: [{ name: 'a', value: '5', note: t('side', '변') }, { name: 'b', value: '7', note: t('side', '변') }, { name: 'C', value: 'pi/3', note: t('angle between them (radians)', '끼인각(라디안)') }],
    result: 'let c = sqrt(a^2 + b^2 - 2a b cos(C))',
  },
  {
    id: 'sines', subject: 'trig', name: t('Law of sines', '사인 법칙'), formula: 'a = b sin(A)/sin(B)',
    inputs: [{ name: 'b', value: '8', note: t('side opposite B', 'B의 대변') }, { name: 'A', value: 'pi/4', note: t('angle A (radians)', '각 A(라디안)') }, { name: 'B', value: 'pi/3', note: t('angle B (radians)', '각 B(라디안)') }],
    result: 'let a = b sin(A)/sin(B)',
  },
  {
    id: 'sas-area', subject: 'trig', name: t('Triangle area from two sides', '두 변과 끼인각으로 넓이'), formula: 'S = a b sin(C)/2',
    inputs: [{ name: 'a', value: '5', note: t('side', '변') }, { name: 'b', value: '7', note: t('side', '변') }, { name: 'C', value: 'pi/6', note: t('angle between them (radians)', '끼인각(라디안)') }],
    result: 'let S = a b sin(C)/2',
  },
  {
    id: 'deg-rad', subject: 'trig', name: t('Degrees to radians', '도를 라디안으로'), formula: 'θ = d pi/180',
    inputs: [{ name: 'd', value: '60', note: t('angle in degrees', '각(도)') }],
    result: 'let θ = d pi/180',
  },
  // ---------- calculus
  {
    id: 'rate', subject: 'calculus', name: t('Average rate of change', '평균변화율'), formula: '(f(b) - f(a))/(b - a)',
    inputs: [{ name: 'f(x)', value: 'x^2', note: t('the function', '함수'), fn: true }, { name: 'a', value: '1', note: t('from', '처음 x') }, { name: 'b', value: '3', note: t('to', '나중 x') }],
    result: '(f(b) - f(a))/(b - a)',
  },
  {
    id: 'tangent', subject: 'calculus', name: t('Tangent line', '접선의 방정식'), formula: "y = f'(a)(x - a) + f(a)",
    inputs: [{ name: 'f(x)', value: 'x^3 - 3x', note: t('the function', '함수'), fn: true }, { name: 'a', value: '2', note: t('touching point x', '접점의 x') }],
    result: "y = f'(a)(x - a) + f(a)",
  },
  {
    id: 'area', subject: 'calculus', name: t('Area under a curve', '곡선 아래의 넓이'), formula: 'integrate(f(x), x, a, b)',
    inputs: [{ name: 'f(x)', value: 'x^2', note: t('the function', '함수'), fn: true }, { name: 'a', value: '0', note: t('from', '아래끝') }, { name: 'b', value: '3', note: t('to', '위끝') }],
    result: 'integrate(f(x), x, a, b)',
  },
  // ---------- statistics
  {
    id: 'mean', subject: 'statistics', name: t('Mean of data', '자료의 평균'), formula: 'mean(xs)',
    inputs: [{ name: 'xs', value: '[2, 4, 4, 4, 5, 5, 7, 9]', note: t('the data', '자료') }],
    result: 'mean(xs)',
  },
  {
    id: 'z', subject: 'statistics', name: t('Standard score', '표준점수(z)'), formula: 'z = (x - μ)/σ',
    inputs: [{ name: 'x', value: '85', note: t('value', '값') }, { name: 'μ', value: '70', note: t('mean', '평균') }, { name: 'σ', value: '10', note: t('standard deviation', '표준편차') }],
    result: 'let z = (x - μ)/σ',
  },
  {
    id: 'normal', subject: 'statistics', name: t('Normal probability', '정규분포 확률'), formula: 'P(a ≤ X ≤ b)',
    inputs: [{ name: 'a', value: '60', note: t('from', '아래') }, { name: 'b', value: '80', note: t('to', '위') }, { name: 'μ', value: '70', note: t('mean', '평균') }, { name: 'σ', value: '10', note: t('standard deviation', '표준편차') }],
    result: 'normalcdf(a, b, μ, σ)',
  },
  {
    id: 'binomial', subject: 'statistics', name: t('Binomial probability', '이항분포 확률'), formula: 'P(X = k) = nCr(n, k) p^k (1 - p)^(n - k)',
    inputs: [{ name: 'n', value: '10', note: t('trials', '시행 횟수') }, { name: 'p', value: '0.5', note: t('chance of success', '성공 확률') }, { name: 'k', value: '3', note: t('successes', '성공 횟수') }],
    result: 'binompdf(n, p, k)',
  },
  {
    id: 'combinations', subject: 'statistics', name: t('Combinations and permutations', '조합과 순열'), formula: 'nCr(n, r) = n!/(r!(n - r)!)',
    inputs: [{ name: 'n', value: '10', note: t('items', '전체 개수') }, { name: 'r', value: '3', note: t('chosen', '고르는 개수') }],
    result: 'nCr(n, r)',
  },
  // ---------- physics
  {
    id: 'velocity', subject: 'physics', name: t('Velocity with constant acceleration', '등가속도 운동: 속도'), formula: 'v = v_0 + a t',
    inputs: [{ name: 'v_0', value: '2', note: t('starting velocity (m/s)', '처음 속도(m/s)') }, { name: 'a', value: '3', note: t('acceleration (m/s²)', '가속도(m/s²)') }, { name: 't', value: '4', note: t('time (s)', '시간(s)') }],
    result: 'let v = v_0 + a t', unit: 'm/s',
  },
  {
    id: 'displacement', subject: 'physics', name: t('Displacement with constant acceleration', '등가속도 운동: 변위'), formula: 's = v_0 t + a t^2/2',
    inputs: [{ name: 'v_0', value: '2', note: t('starting velocity (m/s)', '처음 속도(m/s)') }, { name: 'a', value: '3', note: t('acceleration (m/s²)', '가속도(m/s²)') }, { name: 't', value: '4', note: t('time (s)', '시간(s)') }],
    result: 'let s = v_0 t + a t^2/2', unit: 'm',
  },
  {
    id: 'force', subject: 'physics', name: t("Newton's second law", '뉴턴의 운동 제2법칙'), formula: 'F = m a',
    inputs: [{ name: 'm', value: '2', note: t('mass (kg)', '질량(kg)') }, { name: 'a', value: '9.8', note: t('acceleration (m/s²)', '가속도(m/s²)') }],
    result: 'let F = m a', unit: 'N',
  },
  {
    id: 'kinetic', subject: 'physics', name: t('Kinetic energy', '운동 에너지'), formula: 'E_k = m v^2/2',
    inputs: [{ name: 'm', value: '2', note: t('mass (kg)', '질량(kg)') }, { name: 'v', value: '3', note: t('speed (m/s)', '속력(m/s)') }],
    result: 'let E_k = m v^2/2', unit: 'J',
  },
  {
    id: 'potential', subject: 'physics', name: t('Potential energy', '위치 에너지'), formula: 'E_p = m g h',
    inputs: [{ name: 'm', value: '2', note: t('mass (kg)', '질량(kg)') }, { name: 'g', value: '9.8', note: t('gravity (m/s²)', '중력 가속도(m/s²)') }, { name: 'h', value: '10', note: t('height (m)', '높이(m)') }],
    result: 'let E_p = m g h', unit: 'J',
  },
  {
    id: 'momentum', subject: 'physics', name: t('Momentum', '운동량'), formula: 'p = m v',
    inputs: [{ name: 'm', value: '2', note: t('mass (kg)', '질량(kg)') }, { name: 'v', value: '3', note: t('velocity (m/s)', '속도(m/s)') }],
    result: 'let p = m v', unit: 'kg·m/s',
  },
  {
    id: 'ohm', subject: 'physics', name: t("Ohm's law", '옴의 법칙'), formula: 'V = I R',
    inputs: [{ name: 'I', value: '2', note: t('current (A)', '전류(A)') }, { name: 'R', value: '5', note: t('resistance (Ω)', '저항(Ω)') }],
    result: 'let V = I R', unit: 'V',
  },
  {
    id: 'power', subject: 'physics', name: t('Electric power', '전력'), formula: 'P = V I',
    inputs: [{ name: 'V', value: '220', note: t('voltage (V)', '전압(V)') }, { name: 'I', value: '2', note: t('current (A)', '전류(A)') }],
    result: 'let P = V I', unit: 'W',
  },
  {
    id: 'density', subject: 'physics', name: t('Density', '밀도'), formula: 'ρ = m/V',
    inputs: [{ name: 'm', value: '500', note: t('mass (g)', '질량(g)') }, { name: 'V', value: '200', note: t('volume (cm³)', '부피(cm³)') }],
    result: 'let ρ = m/V', unit: 'g/cm³',
  },
  {
    id: 'wave', subject: 'physics', name: t('Wave speed', '파동의 속력'), formula: 'v = f λ',
    inputs: [{ name: 'f', value: '440', note: t('frequency (Hz)', '진동수(Hz)') }, { name: 'λ', value: '0.78', note: t('wavelength (m)', '파장(m)') }],
    result: 'let v = f λ', unit: 'm/s',
  },
  {
    id: 'gravity', subject: 'physics', name: t('Universal gravitation', '만유인력'), formula: 'F = G m_1 m_2/r^2',
    inputs: [{ name: 'm_1', value: '5.97e24', note: t('first mass (kg)', '첫째 질량(kg)') }, { name: 'm_2', value: '70', note: t('second mass (kg)', '둘째 질량(kg)') }, { name: 'r', value: '6.37e6', note: t('distance (m)', '거리(m)') }],
    result: 'let F = 6.674e-11 m_1 m_2/r^2', unit: 'N',
  },
  {
    id: 'pendulum', subject: 'physics', name: t('Period of a pendulum', '단진자의 주기'), formula: 'T = 2pi sqrt(L/g)',
    inputs: [{ name: 'L', value: '1', note: t('length (m)', '길이(m)') }, { name: 'g', value: '9.8', note: t('gravity (m/s²)', '중력 가속도(m/s²)') }],
    result: 'let T = 2pi sqrt(L/g)', unit: 's',
  },
];

/** The base name of an input: f for f(x), else itself */
export const inputName = (name: string) => name.replace(/\(.*$/, '');

/**
 * The lines a formula inserts, with inputs that clash with names already
 * in the worksheet renamed (r → r_2), so inserting never breaks a line.
 */
export function formulaLines(f: Formula, values: Record<string, string>, taken: Set<string>): string[] {
  const rename = new Map<string, string>();
  const resultName = /^let\s+([\p{L}][\p{L}\p{N}_]*)/u.exec(f.result)?.[1];
  const names = [...f.inputs.map((i) => inputName(i.name)), ...(resultName ? [resultName] : [])];
  for (const n of names) {
    if (!taken.has(n)) continue;
    let k = 2;
    const base = n.includes('_') ? `${n}` : n;
    while (taken.has(`${base}_${k}`) || names.includes(`${base}_${k}`)) k++;
    rename.set(n, `${base}_${k}`);
  }
  const swap = (src: string) =>
    src.replace(/[\p{L}][\p{L}\p{N}_]*/gu, (w) => rename.get(w) ?? w);
  const lines = f.inputs.map((i) => {
    const v = (values[i.name] ?? i.value).trim() || i.value;
    return `let ${swap(i.name)} = ${v}`;
  });
  return [...lines, swap(f.result)];
}
