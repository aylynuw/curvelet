// Makes the problem pack: one problem set per unit, in a zip that Study's
// "Open a set file" reads. Each set holds the hand-written problems of its
// unit from problems/bank.json and, for every template of the unit (basic,
// advanced and exam level), PER_TEMPLATE problems with fixed numbers.
//
//   node scripts/problem-pack.mjs            → problems/dist/curvelet-problems.zip
//   node scripts/problem-pack.mjs 30         → 30 problems per template
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { runnerImport } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PER_TEMPLATE = Number(process.argv[2] ?? 20);
const { module: steps } = await runnerImport(join(root, 'packages/steps/src/index.ts'));
const { LEVEL_TEMPLATES, makeProblem, parseBank } = steps;

const UNITS = [
  ['algebra', '대수', 'Algebra', '1-대수'],
  ['calculus', '미적분Ⅰ', 'Calculus I', '2-미적분1'],
  ['calc2', '미적분Ⅱ', 'Calculus II', '3-미적분2'],
  ['stats', '확률과 통계', 'Probability and Statistics', '4-확률과통계'],
  ['geometry', '기하', 'Geometry', '5-기하'],
];
const LEVELS = ['basic', 'advanced', 'exam'];
const hand = JSON.parse(readFileSync(join(root, 'problems/bank.json'), 'utf8'));

const files = [];
const summary = [];
for (const [unit, ko, en, file] of UNITS) {
  const problems = hand.problems.filter((p) => p.unit === unit);
  const seen = new Set(problems.map((p) => p.prompt.ko));
  for (const level of LEVELS) {
    for (const template of LEVEL_TEMPLATES[level][unit] ?? []) {
      let made = 0;
      for (let seed = 1; seed <= PER_TEMPLATE * 6 && made < PER_TEMPLATE; seed++) {
        const p = makeProblem(template, seed);
        if (!Number.isFinite(p.value) || seen.has(p.prompt.ko)) continue;
        seen.add(p.prompt.ko);
        problems.push({ id: `${template}-${seed}`, unit, level, points: p.points, prompt: p.prompt, answer: p.value, solution: p.solution });
        made++;
      }
    }
  }
  const set = {
    format: 'curvelet-problems',
    version: 1,
    title: { ko: `Curvelet 문제집: ${ko}`, en: `Curvelet problems: ${en}` },
    note: hand.note,
    problems,
  };
  // the app reads it back whole
  const { bank, skipped } = parseBank(set);
  if (skipped.length || bank.problems.length !== problems.length) throw new Error(`${unit}: ${skipped.length} problems do not read`);
  const levelOf = (p) => p.level ?? (p.points === 2 ? 'basic' : p.points === 3 ? 'advanced' : 'exam');
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, problems.filter((p) => levelOf(p) === l).length]));
  summary.push(`${ko}: ${problems.length} (기본 ${byLevel.basic}, 심화 ${byLevel.advanced}, 평가원 ${byLevel.exam})`);
  files.push({ name: `curvelet-problems/${file}.json`, data: Buffer.from(JSON.stringify(set, null, 2) + '\n') });
}
const total = files.reduce((n, f) => n + JSON.parse(f.data).problems.length, 0);
files.push({
  name: 'curvelet-problems/README.txt',
  data: Buffer.from(
    [
      'Curvelet 문제집 묶음 / Curvelet problem pack',
      '',
      'Curvelet의 학습 탭에서 "파일에서 가져오기"로 이 zip 파일을 그대로 열면 모든 단원의 문제가 연습과 학습지에 들어갑니다.',
      'Open this zip as it is with "Open a set file" in Curvelet\'s Study tab: every unit\'s problems join practice and worksheets.',
      '',
      ...summary,
      `합계 / Total: ${total}`,
      '',
      '각 단원의 직접 쓴 문제(problems/bank.json)와, 앱의 문제 틀에서 숫자를 정해 만든 문제입니다. 실제 기출 문항이 아닙니다.',
      'Hand-written problems from problems/bank.json, and problems made from the app\'s templates with fixed numbers. They are not past exam questions.',
      '',
    ].join('\n'),
  ),
});

// a plain zip: deflated entries, a central directory, UTF-8 names
const local = [];
const central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(f.name, 'utf8');
  const body = deflateRawSync(f.data, { level: 9 });
  const crc = crc32(f.data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0800, 6); // UTF-8 names
  head.writeUInt16LE(8, 8);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(body.length, 18);
  head.writeUInt32LE(f.data.length, 22);
  head.writeUInt16LE(name.length, 26);
  local.push(head, name, body);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(f.data.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt32LE(offset, 42);
  central.push(dir, name);
  offset += head.length + name.length + body.length;
}
const dirSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(dirSize, 12);
end.writeUInt32LE(offset, 16);

const out = join(root, 'problems/dist/curvelet-problems.zip');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(summary.join('\n'));
console.log(`Total ${total} → ${out}`);
