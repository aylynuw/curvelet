/**
 * Reads the files in a .zip: stored or deflated entries, as text. Enough for
 * problem-set packs; no encryption, no zip64.
 */
export async function readZip(data: ArrayBuffer): Promise<{ name: string; text: string }[]> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  // the end of central directory record: its signature, searched from the end
  let end = -1;
  for (let k = bytes.length - 22; k >= Math.max(0, bytes.length - 22 - 0xffff); k--) {
    if (view.getUint32(k, true) === 0x06054b50) {
      end = k;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip file');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const names = new TextDecoder();
  const out: { name: string; text: string }[] = [];
  for (let k = 0; k < count; k++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Broken zip directory');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.slice(start, start + size);
    let content: Uint8Array;
    if (method === 0) content = raw;
    else if (method === 8) content = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push({ name, text: new TextDecoder().decode(content) });
  }
  return out;
}
