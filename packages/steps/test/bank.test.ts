import file from '../../../problems/bank.json';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAnswer, LEVEL_TEMPLATES, loadBank, makeProblem, nextProblem, parseBank, TEMPLATES } from '../src';


describe('problem sets', () => {
  afterEach(() => loadBank(null));

  it('the set in the repository is whole: every problem reads, with working in both languages', () => {
    const { bank, skipped } = parseBank(file);
    expect(skipped).toEqual([]);
    expect(bank.problems.length).toBeGreaterThanOrEqual(30);
    for (const p of bank.problems) {
      expect(p.solution.ko.length, p.id).toBe(p.solution.en.length);
      expect(p.prompt.ko, p.id).toMatch(/\$\$/);
      expect(Number.isInteger(p.answer), p.id).toBe(true);
    }
  });

  it('its problems join practice at their level and unit, and leave when another set loads', () => {
    const { bank } = parseBank(file);
    const before = LEVEL_TEMPLATES.exam.geometry!.length;
    loadBank(bank);
    expect(LEVEL_TEMPLATES.exam.geometry!.length).toBe(before + bank.problems.filter((p) => p.unit === 'geometry').length);
    const p = makeProblem('bank-g02', 1);
    expect(p.value).toBe(16);
    expect(checkAnswer(p, '16')).toEqual({ correct: true });
    expect(checkAnswer(p, '15').correct).toBe(false);
    // drawn like any other problem
    const seen = new Set<string>();
    for (let k = 0; k < 400; k++) seen.add(nextProblem('geometry', Math.random, 'exam').template);
    expect([...seen].some((n) => n.startsWith('bank-'))).toBe(true);
    loadBank(null);
    expect(LEVEL_TEMPLATES.exam.geometry!.length).toBe(before);
    expect(Object.keys(TEMPLATES).some((n) => n.startsWith('bank-'))).toBe(false);
  });

  it('skips problems that do not fit, and refuses files that are not sets', () => {
    const { bank, skipped } = parseBank({
      format: 'curvelet-problems',
      problems: [
        file.problems[0],
        { ...file.problems[1], unit: 'physics' },
        { ...file.problems[2], answer: 'twelve' },
        file.problems[0],
      ],
    });
    expect(bank.problems.length).toBe(1);
    expect(skipped).toEqual([file.problems[1]!.id, file.problems[2]!.id, file.problems[0]!.id]);
    expect(() => parseBank({ problems: [] })).toThrow();
    expect(() => parseBank(null)).toThrow();
  });
});
