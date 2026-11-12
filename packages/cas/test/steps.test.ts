import { parseExpression } from '@math/engine';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { CasResolver } from '../src';
import { createNodeRuntime } from '../src/node';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'pyodide-dist');
let resolver: CasResolver;
beforeAll(async () => {
  resolver = new CasResolver(await createNodeRuntime(DIST));
}, 120_000);

async function steps(src: string, v = 'x') {
  const args = [parseExpression(src), parseExpression(v)];
  const settings = { angle: 'rad' as const, complex: false };
  resolver.resolve('integral_steps', args, settings);
  await resolver.idle();
  return resolver.resolve('integral_steps', args, settings)!;
}

const rules = (s: { rule: string; parts?: unknown[] }): string[] => [s.rule, ...((s.parts ?? []) as never[]).flatMap(rules)];

describe('integral steps from SymPy', () => {
  it('a sum of powers: the sum rule, then the power rule', async () => {
    const a = await steps('3x^2 + 2x');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.steps!.rule).toBe('AddRule');
    expect(rules(a.steps!)).toContain('PowerRule');
    expect(a.steps!.result).toBe('x^3 + x^2');
  });

  it('substitution names u', async () => {
    const a = await steps('2x cos(x^2)');
    if (!a.ok) throw new Error(a.error);
    const all = rules(a.steps!);
    expect(all).toContain('URule');
    const u = JSON.stringify(a.steps);
    expect(u).toContain('"u_func":"x^2"');
    expect(u).toContain('"u_var":"u"');
    expect(u).not.toContain('_u');
  });

  it('integration by parts names u and dv', async () => {
    const a = await steps('x e^x');
    if (!a.ok) throw new Error(a.error);
    expect(rules(a.steps!)).toContain('PartsRule');
    expect(JSON.stringify(a.steps)).toMatch(/"u":"x"/);
  });

  it('says when it has no method', async () => {
    const a = await steps('x^x');
    expect(a.ok).toBe(false);
  });
});
