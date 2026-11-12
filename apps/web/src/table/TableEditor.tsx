import { useRef, type KeyboardEvent } from 'react';
import type { Strings } from '../i18n';
import { NEEDS, pairs, withSpareRow, type Model, type Table } from './table';

const MODELS: Model[] = ['linreg', 'quadreg', 'expreg', 'logreg'];

/**
 * A table line: x and y columns, a spare row at the bottom, and buttons that
 * add a regression line for the points. Enter or ↓ moves down a column.
 */
export function TableEditor({ n, t, table, onChange, onFit }: { n: number; t: Strings; table: Table; onChange: (t: Table) => void; onFit: (m: Model) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = table.x.length;
  const filled = pairs(table).length;
  const set = (col: 'x' | 'y', row: number, value: string) => {
    const next = { x: [...table.x], y: [...table.y] };
    next[col][row] = value;
    onChange(withSpareRow(next));
  };
  const move = (col: 'x' | 'y', row: number) => {
    const cell = ref.current?.querySelector<HTMLInputElement>(`[data-cell="${col}${row}"]`);
    cell?.focus();
    cell?.select();
  };
  const onKey = (col: 'x' | 'y', row: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      // the spare row appears once this one has something in it
      requestAnimationFrame(() => move(col, row + 1));
    } else if (e.key === 'ArrowUp' && row > 0) {
      e.preventDefault();
      move(col, row - 1);
    }
  };
  return (
    <div className="table" ref={ref}>
      <table className="table__grid" aria-label={t.tableLabel(n)}>
        <thead>
          <tr>
            <th scope="col">x</th>
            <th scope="col">y</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, k) => (
            <tr key={k}>
              {(['x', 'y'] as const).map((col) => (
                <td key={col}>
                  <input
                    className="table__cell"
                    data-cell={`${col}${k}`}
                    inputMode="decimal"
                    aria-label={t.tableCell(col, k + 1)}
                    value={table[col][k] ?? ''}
                    onChange={(e) => set(col, k, e.target.value)}
                    onKeyDown={onKey(col, k)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table__fit" role="group" aria-label={t.fitLabel}>
        <span className="field__label">{t.fitLabel}</span>
        {MODELS.map((m) => (
          <button key={m} type="button" className="btn btn--small" disabled={filled < NEEDS[m]} onClick={() => onFit(m)}>
            {t.fitModel[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
