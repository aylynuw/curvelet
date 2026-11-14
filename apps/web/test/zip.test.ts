import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readZip } from '../src/learn/zip';

/** a zip with the given files, deflated or stored, the way problem packs are written */
function zip(files: { name: string; text: string; store?: boolean }[]): ArrayBuffer {
  const parts: Buffer[] = [];
  const dir: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const data = Buffer.from(f.text);
    const body = f.store ? data : deflateRawSync(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(f.store ? 0 : 8, 8);
    head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    parts.push(head, name, body);
    const d = Buffer.alloc(46);
    d.writeUInt32LE(0x02014b50, 0);
    d.writeUInt16LE(f.store ? 0 : 8, 10);
    d.writeUInt32LE(body.length, 20);
    d.writeUInt32LE(data.length, 24);
    d.writeUInt16LE(name.length, 28);
    d.writeUInt32LE(offset, 42);
    dir.push(d, name);
    offset += 30 + name.length + body.length;
  }
  const size = dir.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, ...dir, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer;
}

describe('readZip', () => {
  it('reads deflated and stored files, with Korean names', async () => {
    const text = JSON.stringify({ format: 'curvelet-problems', problems: Array.from({ length: 200 }, (_, k) => ({ id: `p${k}`, prompt: '수학 문제' })) });
    const files = await readZip(zip([{ name: 'pack/1-수학1.json', text }, { name: 'pack/README.txt', text: 'hi', store: true }]));
    expect(files.map((f) => f.name)).toEqual(['pack/1-수학1.json', 'pack/README.txt']);
    expect(files[0]!.text).toBe(text);
    expect(files[1]!.text).toBe('hi');
  });

  it('refuses a file that is not a zip', async () => {
    await expect(readZip(new TextEncoder().encode('{"format": "curvelet-problems"}').buffer as ArrayBuffer)).rejects.toThrow();
  });
});
