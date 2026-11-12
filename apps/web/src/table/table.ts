/** a table of points: x and y columns as typed (empty cells allowed) */
export interface Table {
  x: string[];
  y: string[];
}

export const emptyTable = (): Table => ({ x: ['', '', ''], y: ['', '', ''] });

const isNum = (s: string) => s.trim() !== '' && Number.isFinite(Number(s.trim().replace('−', '-')));
const num = (s: string) => String(Number(s.trim().replace('−', '-')));

/** the rows where both cells hold a number */
export function pairs(t: Table): [string, string][] {
  const out: [string, string][] = [];
  for (let k = 0; k < Math.max(t.x.length, t.y.length); k++) {
    const [x, y] = [t.x[k] ?? '', t.y[k] ?? ''];
    if (isNum(x) && isNum(y)) out.push([num(x), num(y)]);
  }
  return out;
}

const lists = (t: Table) => {
  const p = pairs(t);
  return `[${p.map((r) => r[0]).join(', ')}], [${p.map((r) => r[1]).join(', ')}]`;
};

/** the line a table stands for: a scatter plot of its complete rows */
export const tableSource = (t: Table) => (pairs(t).length ? `points(${lists(t)})` : '');

export type Model = 'linreg' | 'quadreg' | 'expreg' | 'logreg';
/** how many rows each model needs */
export const NEEDS: Record<Model, number> = { linreg: 2, quadreg: 3, expreg: 2, logreg: 2 };
/** the regression line for a table */
export const fitSource = (t: Table, model: Model) => `${model}(${lists(t)})`;

/** a table from storage, or undefined when it isn't one */
export function cleanTable(v: unknown): Table | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const col = (c: unknown) => (Array.isArray(c) ? c.filter((s): s is string => typeof s === 'string').slice(0, 1000) : null);
  const [x, y] = [col(o.x), col(o.y)];
  if (!x || !y) return undefined;
  const n = Math.max(x.length, y.length, 1);
  return { x: Array.from({ length: n }, (_, k) => x[k] ?? ''), y: Array.from({ length: n }, (_, k) => y[k] ?? '') };
}

/** after an edit: always one empty row at the bottom to type into */
export function withSpareRow(t: Table): Table {
  const n = t.x.length;
  const lastEmpty = n > 0 && !(t.x[n - 1] ?? '').trim() && !(t.y[n - 1] ?? '').trim();
  return lastEmpty ? t : { x: [...t.x, ''], y: [...t.y, ''] };
}
