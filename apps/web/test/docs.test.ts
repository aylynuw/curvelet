import { describe, expect, it } from 'vitest';
import { fileName, fromFile, toFile } from '../src/files/docs';

describe('worksheet files', () => {
  it('round trips lines and their looks', () => {
    const lines = [{ source: 'y = x^2', look: { color: '#ff0000', dash: 'dashed' as const } }, { source: 'a = 2' }];
    expect(fromFile(toFile('Parabola', lines), 'x')).toEqual({ name: 'Parabola', lines });
  });
  it('refuses files that are not worksheets and cleans what it reads', () => {
    expect(fromFile('not json', 'x')).toBe(null);
    expect(fromFile('{"lines": []}', 'x')).toBe(null);
    const odd = JSON.stringify({ format: 'calculator-worksheet', lines: [{ source: 'y = x', look: { color: 'red', width: 99 } }, { nope: 1 }] });
    expect(fromFile(odd, 'Untitled')).toEqual({ name: 'Untitled', lines: [{ source: 'y = x' }] });
  });
  it('makes safe file names', () => {
    expect(fileName('Unit 3: circles/arcs')).toBe('Unit 3- circles-arcs.calc.json');
    expect(fileName('  ')).toBe('worksheet.calc.json');
  });
});
