import { createContext, useContext } from 'react';
import { exactNumber, toFraction } from './calc/fraction';

/**
 * How numbers are shown everywhere: exactly (fractions, roots, π) or as
 * decimals. One setting for the expression list, the calculator and the
 * points the graph writes.
 */
export type NumberForm = 'exact' | 'decimal';
export const NUMBER_FORM_KEY = 'calculator.format.v1';

export function loadNumberForm(): NumberForm {
  try {
    return localStorage.getItem(NUMBER_FORM_KEY) === '"decimal"' ? 'decimal' : 'exact';
  } catch {
    return 'exact';
  }
}
export function saveNumberForm(f: NumberForm) {
  try {
    localStorage.setItem(NUMBER_FORM_KEY, JSON.stringify(f));
  } catch {
    // remembered for this visit only
  }
}

export const NumberFormContext = createContext<NumberForm>('exact');
export const useNumberForm = () => useContext(NumberFormContext);

/**
 * Plain decimals in a text as fractions where they are one (2.2 → 11/5,
 * 0.333333333333 → 1/3); others, like 3.14159265359, stay decimals. Numbers
 * written with an exponent are left alone.
 */
export function fractionsIn(text: string): string {
  return text.replace(/(?<![\d.e])(-?\d+\.\d+)(?![\d.]|e[-+]?\d)/g, (m) => toFraction(Number(m), 1000) ?? m);
}

/** a coordinate as a line writes it: a fraction (when it is one) or a short decimal */
export function writeNumber(v: number, form: NumberForm): string {
  const near = Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v;
  if (Number.isInteger(near)) return String(Object.is(near, -0) ? 0 : near);
  if (form === 'exact') {
    // a fraction, a root or a multiple of π, as the line can be read back: 2sqrt(2), pi/6
    const f = toFraction(near, 1000) ?? exactNumber(near);
    if (f) return f;
  }
  return String(Number(near.toFixed(4)));
}
