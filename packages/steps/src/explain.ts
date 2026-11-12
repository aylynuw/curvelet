import { nice, type Num } from './nice';

/** An interval of x; null ends are −∞ and ∞. */
export interface Interval {
  lo: Num | null;
  hi: Num | null;
  loClosed: boolean;
  hiClosed: boolean;
}
export interface Point {
  x: Num;
  y: Num;
}

/**
 * What a student would say about y = f(x), found numerically on −range ≤ x ≤ range
 * and written exactly where the numbers are recognisable. When the graph
 * repeats, points are listed for one period, starting at 0.
 */
export interface Explanation {
  range: number;
  domain: Interval[];
  /** every real number */
  allReals: boolean;
  /** the domain is all reals except these (poles and holes), when that is the shape of it */
  excluded: Num[];
  /** excluded points that repeat: start + n·step */
  excludedEvery?: { start: Num; step: Num };
  yIntercept: Num | null;
  xIntercepts: Num[];
  increasing: Interval[];
  decreasing: Interval[];
  constant: boolean;
  maxima: Point[];
  minima: Point[];
  concaveUp: Interval[];
  concaveDown: Interval[];
  inflections: Point[];
  straight: boolean;
  vertical: Num[];
  horizontal: { side: 'both' | 'left' | 'right'; y: Num }[];
  oblique: { side: 'both' | 'left' | 'right'; m: Num; b: Num }[];
  symmetry: 'even' | 'odd' | null;
  period: Num | null;
}

type F = (x: number) => number;

const bisect = (g: F, a: number, b: number, ga = g(a)) => {
  for (let k = 0; k < 80; k++) {
    const m = (a + b) / 2;
    const gm = g(m);
    if (!Number.isFinite(gm)) return m;
    if (Math.sign(gm) === Math.sign(ga)) [a, ga] = [m, gm];
    else b = m;
    if (b - a < 1e-13 * Math.max(1, Math.abs(a))) break;
  }
  return (a + b) / 2;
};

/** the x in [a, b] where g is largest */
function golden(g: F, a: number, b: number): number {
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a);
  let d = a + r * (b - a);
  let gc = g(c);
  let gd = g(d);
  for (let k = 0; k < 100 && b - a > 1e-12 * Math.max(1, Math.abs(a)); k++) {
    if (gc > gd) {
      b = d;
      d = c;
      gd = gc;
      c = b - r * (b - a);
      gc = g(c);
    } else {
      a = c;
      c = d;
      gc = gd;
      d = a + r * (b - a);
      gd = g(d);
    }
  }
  return (a + b) / 2;
}

/** a finite domain boundary between a defined and an undefined sample */
function edge(f: F, inside: number, outside: number): number {
  let [a, b] = [inside, outside];
  for (let k = 0; k < 80; k++) {
    const m = (a + b) / 2;
    if (Number.isFinite(f(m))) a = m;
    else b = m;
  }
  return a;
}

export function explainGraph(f: F, range = 50): Explanation {
  const N = 8000;
  const h = (2 * range) / N;
  const xs = Array.from({ length: N + 1 }, (_, k) => -range + k * h);
  const ys = xs.map(f);
  const fin = ys.map(Number.isFinite);
  const finiteYs = ys.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  const scale = Math.max(1, finiteYs[Math.floor(finiteYs.length / 2)] ?? 1);

  // ---- breaks: poles inside defined runs, and single undefined samples
  const poles: number[] = [];
  const holes: number[] = [];
  const huge = (x: number) => {
    const v = Math.max(Math.abs(f(x - 1e-9 * Math.max(1, Math.abs(x)))), Math.abs(f(x + 1e-9 * Math.max(1, Math.abs(x)))));
    return !Number.isFinite(v) || v > 1e6 * scale;
  };
  for (let i = 1; i < N; i++) {
    if (!fin[i] && fin[i - 1] && fin[i + 1]) {
      (huge(xs[i]!) ? poles : holes).push(xs[i]!);
      continue;
    }
    if (!fin[i] || !fin[i - 1] || !fin[i + 1]) continue;
    const [a, b, c] = [Math.abs(ys[i - 1]!), Math.abs(ys[i]!), Math.abs(ys[i + 1]!)];
    // a spike in |f|, or a jump across zero with huge values: a pole near here
    const spike = b > a && b >= c && b > 50 * scale;
    const jump = Math.sign(ys[i]!) !== Math.sign(ys[i + 1]!) && Math.abs(ys[i]! - ys[i + 1]!) > 100 * scale;
    if (spike || jump) {
      const lo = spike ? xs[i - 1]! : xs[i]!;
      const hi = xs[i + 1]!;
      const p = jump && !spike ? bisect((x) => 1 / f(x), lo, hi) : golden((x) => Math.abs(f(x)), lo, hi);
      if (huge(p) && !poles.some((q) => Math.abs(q - p) < h)) poles.push(p);
    }
  }
  const poleNums = poles.sort((a, b) => a - b).map((p) => nice(p, 1e-7));
  const holeNums = holes.map((p) => nice(p, 1e-7));

  // ---- domain: runs of defined samples
  const runs: [number, number][] = [];
  for (let i = 0; i <= N; ) {
    if (!fin[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 <= N && (fin[j + 1] || (j + 2 <= N && fin[j + 2] && (poles.includes(xs[j + 1]!) || holes.includes(xs[j + 1]!))))) j++;
    runs.push([i, j]);
    i = j + 1;
  }
  const domain: Interval[] = runs.map(([i, j]) => {
    const lo = i === 0 ? null : nice(edge(f, xs[i]!, xs[i - 1]!), 1e-7);
    const hi = j === N ? null : nice(edge(f, xs[j]!, xs[j + 1]!), 1e-7);
    return { lo, hi, loClosed: !!lo && Number.isFinite(f(lo.value)), hiClosed: !!hi && Number.isFinite(f(hi.value)) };
  });
  const whole = domain.length === 1 && !domain[0]!.lo && !domain[0]!.hi;
  const breaks = [...poleNums, ...holeNums].sort((a, b) => a.value - b.value);

  // ---- continuous pieces: domain runs split at the breaks
  const pieces: [number, number][] = [];
  for (const d of domain) {
    let a = d.lo?.value ?? -range;
    for (const b of breaks) {
      if (b.value > a && b.value < (d.hi?.value ?? range)) {
        pieces.push([a, b.value]);
        a = b.value;
      }
    }
    pieces.push([a, d.hi?.value ?? range]);
  }
  const inside = (x: number) => pieces.some(([a, b]) => x > a && x < b);

  // ---- zeros, extrema, inflections, sample by sample within each piece
  const zeros: number[] = [];
  const maxima: number[] = [];
  const minima: number[] = [];
  const inflections: number[] = [];
  const d2 = (x: number) => {
    const e = 1e-3 * Math.max(1, Math.abs(x));
    return (f(x + e) - 2 * f(x) + f(x - e)) / (e * e);
  };
  const flat = 1e-7 * scale;
  let allFlatD2 = true;
  for (let i = 1; i < N; i++) {
    const [x0, x1, x2] = [xs[i - 1]!, xs[i]!, xs[i + 1]!];
    if (!inside(x0) || !inside(x1) || !inside(x2)) continue;
    const [y0, y1, y2] = [ys[i - 1]!, ys[i]!, ys[i + 1]!];
    if (y1 === 0) zeros.push(x1);
    else if (Math.sign(y1) !== Math.sign(y2) && y2 !== 0) zeros.push(bisect(f, x1, x2, y1));
    if (y1 > y0 && y1 >= y2 && y1 - Math.min(y0, y2) > 1e-12 * scale) maxima.push(golden(f, x0, x2));
    if (y1 < y0 && y1 <= y2 && Math.max(y0, y2) - y1 > 1e-12 * scale) minima.push(golden((x) => -f(x), x0, x2));
    const c0 = y0 - 2 * y1 + y2;
    if (Math.abs(c0) > flat * h * h) allFlatD2 = false;
  }
  // touching zeros: a maximum or minimum on the axis
  for (const m of [...maxima, ...minima]) if (Math.abs(f(m)) < 1e-9 * scale) zeros.push(m);
  // inflections: d2 changes sign between samples (checked on a coarser grid, d2 is noisy)
  if (!allFlatD2) {
    const tol = 1e-6 * scale;
    let last: { x: number; c: number } | null = null;
    for (let i = 0; i <= N; i += 4) {
      const x = xs[i]!;
      if (!inside(x) || (last && breaks.some((p) => p.value > last!.x && p.value < x))) {
        last = null;
        continue;
      }
      const c = d2(x);
      // a zero right on a sample (x³ at 0) is skipped; the sign on either side decides
      if (Math.abs(c) <= tol) continue;
      if (last && Math.sign(c) !== Math.sign(last.c)) inflections.push(bisect(d2, last.x, x, last.c));
      last = { x, c };
    }
  }

  // ---- does it repeat?
  const spacing = (list: number[]) => {
    const s = [...list].sort((a, b) => a - b);
    if (s.length < 4) return null;
    const gaps = s.slice(1).map((v, k) => v - s[k]!);
    const g = gaps[0]!;
    return gaps.every((d) => Math.abs(d - g) < 1e-5 * Math.max(1, g)) ? g : null;
  };
  let period: number | null = null;
  for (const cand of [spacing(maxima), spacing(minima), spacing(poles), spacing(zeros)]) {
    if (!cand) continue;
    const tests = [0.3, 1.7, 2.9, -4.1, 5.3];
    if (tests.every((t) => !Number.isFinite(f(t)) || Math.abs(f(t + cand) - f(t)) < 1e-7 * scale)) {
      period = cand;
      break;
    }
  }
  const periodNum = period ? nice(period, 1e-6) : null;
  const P = periodNum?.value ?? null;
  // for a repeating graph, one period from 0
  const inPeriod = (x: number) => (P === null ? true : x >= -1e-9 && x < P - 1e-9);

  const snapX = (x: number) => nice(x, 1e-6);
  const point = (x: number): Point => {
    const sx = snapX(x);
    const v = sx.approx ? x : sx.value;
    return { x: sx, y: nice(f(v), 1e-7) };
  };
  const uniq = (list: Num[]) =>
    list.sort((a, b) => a.value - b.value).filter((n, k, arr) => k === 0 || Math.abs(n.value - arr[k - 1]!.value) > 1e-6 * Math.max(1, Math.abs(n.value)));

  const xIntercepts = uniq(zeros.filter(inPeriod).map(snapX));
  const maxPts = uniq(maxima.filter(inPeriod).map(snapX)).map((n) => point(n.value));
  const minPts = uniq(minima.filter(inPeriod).map(snapX)).map((n) => point(n.value));
  const inflPts = uniq(inflections.filter(inPeriod).map(snapX)).map((n) => point(n.value));

  // ---- where it rises and falls, and which way it bends, piece by piece
  const trends = (cuts: number[], test: (a: number, b: number) => number) => {
    const up: Interval[] = [];
    const down: Interval[] = [];
    for (const [a, b] of pieces) {
      const inner = cuts.filter((c) => c > a + 1e-9 && c < b - 1e-9);
      const edges = [a, ...inner, b];
      for (let k = 0; k + 1 < edges.length; k++) {
        const [lo, hi] = [edges[k]!, edges[k + 1]!];
        if (P !== null && (hi <= 0 || lo >= P)) continue;
        const s = test(lo, hi);
        if (s === 0) continue;
        const iv: Interval = {
          lo: lo <= -range + 1e-9 ? null : snapX(lo),
          hi: hi >= range - 1e-9 ? null : snapX(hi),
          loClosed: false,
          hiClosed: false,
        };
        iv.loClosed = !!iv.lo && Number.isFinite(f(iv.lo.value)) && !breaks.some((p) => Math.abs(p.value - iv.lo!.value) < 1e-9);
        iv.hiClosed = !!iv.hi && Number.isFinite(f(iv.hi.value)) && !breaks.some((p) => Math.abs(p.value - iv.hi!.value) < 1e-9);
        (s > 0 ? up : down).push(iv);
      }
    }
    return { up, down };
  };
  const slope = (a: number, b: number) => {
    const [p, q] = [a + (b - a) * 0.25, a + (b - a) * 0.75];
    const d = f(q) - f(p);
    return Math.abs(d) < 1e-10 * scale ? 0 : Math.sign(d);
  };
  const mono = trends([...maxima, ...minima], slope);
  const constant = mono.up.length === 0 && mono.down.length === 0;
  const bend = allFlatD2
    ? { up: [], down: [] }
    : trends(inflections, (a, b) => {
        const s = d2(a + (b - a) / 2);
        return Math.abs(s) < 1e-6 * scale ? 0 : Math.sign(s);
      });

  // ---- asymptotes
  const vertical = uniq(poleNums.filter((p) => inPeriod(p.value)));
  const tail = (s: 1 | -1) => {
    const at = [1e3, 1e4, 1e5, 1e6].map((t) => s * t);
    const v = at.map(f);
    if (!v.every(Number.isFinite)) return null;
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-3 * Math.max(1, Math.abs(b));
    if (close(v[2]!, v[3]!) && close(v[1]!, v[2]!) && Math.abs(v[3]! - v[2]!) <= Math.abs(v[2]! - v[1]!) + 1e-12) {
      return { kind: 'h' as const, y: nice(v[3]!, 1e-4) };
    }
    const m = at.map((t, k) => v[k]! / t);
    if (close(m[2]!, m[3]!) && Math.abs(m[3]!) > 1e-6) {
      const mm = nice(m[3]!, 1e-4);
      const b = at.map((t, k) => v[k]! - mm.value * t);
      if (close(b[2]!, b[3]!)) return { kind: 'o' as const, m: mm, b: nice(b[3]!, 1e-3) };
    }
    return null;
  };
  const [R, L] = [tail(1), tail(-1)];
  const horizontal: Explanation['horizontal'] = [];
  const oblique: Explanation['oblique'] = [];
  if (R?.kind === 'h' && L?.kind === 'h' && R.y.text === L.y.text) horizontal.push({ side: 'both', y: R.y });
  else {
    if (R?.kind === 'h') horizontal.push({ side: 'right', y: R.y });
    if (L?.kind === 'h') horizontal.push({ side: 'left', y: L.y });
  }
  if (R?.kind === 'o' && L?.kind === 'o' && R.m.text === L.m.text && R.b.text === L.b.text) oblique.push({ side: 'both', m: R.m, b: R.b });
  else {
    if (R?.kind === 'o') oblique.push({ side: 'right', m: R.m, b: R.b });
    if (L?.kind === 'o') oblique.push({ side: 'left', m: L.m, b: L.b });
  }

  // ---- symmetry
  const pairs = [0.31, 0.77, 1.13, 1.91, 2.63, 3.37, 5.21].map((t) => [f(t), f(-t)] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const tol = 1e-9 * scale;
  const symmetry =
    pairs.length < 3 || constant ? null : pairs.every(([a, b]) => Math.abs(a - b) < tol) ? 'even' : pairs.every(([a, b]) => Math.abs(a + b) < tol) ? 'odd' : null;

  const y0 = f(0);
  const repeatingBreaks = P !== null && breaks.length > 2;
  return {
    range,
    domain,
    allReals: whole && breaks.length === 0,
    excluded: whole || domain.every((d) => !d.lo && !d.hi) ? uniq(breaks.filter((b) => !repeatingBreaks || inPeriod(b.value))) : [],
    excludedEvery: repeatingBreaks && periodNum ? { start: uniq(breaks.filter((b) => b.value >= 0))[0]!, step: periodNum } : undefined,
    yIntercept: Number.isFinite(y0) ? nice(y0, 1e-9) : null,
    xIntercepts,
    increasing: mono.up,
    decreasing: mono.down,
    constant,
    maxima: maxPts,
    minima: minPts,
    concaveUp: bend.up,
    concaveDown: bend.down,
    inflections: inflPts,
    straight: allFlatD2 && !constant,
    vertical,
    horizontal,
    oblique,
    symmetry,
    period: periodNum,
  };
}
