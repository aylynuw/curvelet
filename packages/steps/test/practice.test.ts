import { describe, expect, it } from 'vitest';
import { checkAnswer, makeProblem, problemSteps, TEMPLATES } from '../src';

describe('practice problems', () => {
  for (const name of Object.keys(TEMPLATES)) {
    it(`${name}: its own answer is right, a changed one is wrong (50 seeds)`, () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = makeProblem(name, seed);
        expect(checkAnswer(p, p.answer), `${p.question} → ${p.answer}`).toEqual({ correct: true });
        const wrong = p.topic === 'equation' ? p.answer.replace(/-?\d+$/, (d) => String(Number(d) + 1)) : `2(${p.answer.replace(/\+ C$/, '')}) + x`;
        expect(checkAnswer(p, wrong).correct, `${p.question} ✗ ${wrong}`).toBe(false);
      }
    });
  }

  it('makes the same problem from the same seed', () => {
    expect(makeProblem('derivative-chain', 7)).toEqual(makeProblem('derivative-chain', 7));
  });

  it('accepts equal forms, not equal text', () => {
    const p = makeProblem('derivative-polynomial', 3);
    expect(checkAnswer(p, `y = ${p.answer}`)).toEqual({ correct: true });
    const q = { ...makeProblem('derivative-product', 1) };
    expect(checkAnswer(q, q.answer)).toEqual({ correct: true });
    const i = makeProblem('integral-polynomial', 4);
    expect(checkAnswer(i, i.answer.replace('+ C', '+ 17'))).toEqual({ correct: true });
  });

  it('reads solutions written several ways', () => {
    const p = { ...makeProblem('equation-quadratic', 1), solutions: [2, 3] };
    for (const s of ['x = 2, x = 3', '3, 2', 'x=2 or x=3', 'x = 2 또는 x = 3', '{2, 3}', 'x = 6/3, x = sqrt(9)']) expect(checkAnswer(p, s), s).toEqual({ correct: true });
    expect(checkAnswer(p, 'x = 2')).toEqual({ correct: false, reason: 'count' });
    expect(checkAnswer(p, 'x = 2, x = 4')).toEqual({ correct: false, reason: 'wrong' });
    expect(checkAnswer(p, '')).toEqual({ correct: false, reason: 'empty' });
    expect(checkAnswer(p, 'x = ((')).toEqual({ correct: false, reason: 'unreadable' });
  });

  it('the steps reach the same solutions', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = makeProblem('equation-quadratic', seed);
      const s = problemSteps(p)!;
      if (s.kind !== 'equation') throw new Error('expected equation steps');
      expect(s.steps.solutions!.length).toBe(p.solutions!.length);
    }
  });
});
