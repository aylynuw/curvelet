/**
 * A small animated-GIF encoder: one 256-colour palette shared by all frames
 * (the most used colours, which suits flat graphics like graphs), LZW
 * compression, and an endless loop. Frames are RGBA, all the same size.
 */
export function encodeGif(frames: Uint8ClampedArray[], width: number, height: number, delayCs: number): Uint8Array {
  const { palette, indexOf } = buildPalette(frames);
  const out = new ByteWriter();
  out.text('GIF89a');
  out.u16(width);
  out.u16(height);
  out.byte(0xf7); // global colour table, 8 bits per channel, 256 entries
  out.byte(0); // background colour
  out.byte(0); // square pixels
  for (let k = 0; k < 256; k++) {
    const c = palette[k] ?? [0, 0, 0];
    out.byte(c[0]);
    out.byte(c[1]);
    out.byte(c[2]);
  }
  // loop forever
  out.bytes([0x21, 0xff, 0x0b]);
  out.text('NETSCAPE2.0');
  out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

  let previous: Uint8Array | null = null;
  for (const rgba of frames) {
    const indices = new Uint8Array(width * height);
    for (let p = 0, q = 0; p < indices.length; p++, q += 4) indices[p] = indexOf(rgba[q]!, rgba[q + 1]!, rgba[q + 2]!);
    // after the first frame, only the rectangle that changed is stored; the rest stays on screen
    let [x0, y0, x1, y1] = [0, 0, width - 1, height - 1];
    if (previous) {
      [x0, y0, x1, y1] = [width, height, -1, -1];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = y * width + x;
          if (indices[p] === previous[p]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      // nothing changed: one pixel, so the frame still takes its time
      if (x1 < 0) [x0, y0, x1, y1] = [0, 0, 0, 0];
    }
    previous = indices;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const part = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) part.set(indices.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + w), y * w);
    // graphic control: leave the frame in place (disposal 1), no transparency, the frame's delay
    out.bytes([0x21, 0xf9, 0x04, 0x04]);
    out.u16(delayCs);
    out.bytes([0x00, 0x00]);
    // image descriptor: the changed rectangle, no local palette
    out.byte(0x2c);
    out.u16(x0);
    out.u16(y0);
    out.u16(w);
    out.u16(h);
    out.byte(0);
    out.byte(8); // LZW minimum code size
    const data = lzw(part);
    for (let k = 0; k < data.length; k += 255) {
      const block = data.subarray(k, k + 255);
      out.byte(block.length);
      out.bytes(block);
    }
    out.byte(0);
  }
  out.byte(0x3b);
  return out.result();
}

/** Colours bucketed to 5 bits per channel; the 256 most common buckets become the palette. */
function buildPalette(frames: Uint8ClampedArray[]) {
  const count = new Uint32Array(32768);
  const sum = new Float64Array(32768 * 3);
  const key = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  for (const f of frames) {
    for (let q = 0; q < f.length; q += 4) {
      const k = key(f[q]!, f[q + 1]!, f[q + 2]!);
      count[k]!++;
      sum[k * 3] = sum[k * 3]! + f[q]!;
      sum[k * 3 + 1] = sum[k * 3 + 1]! + f[q + 1]!;
      sum[k * 3 + 2] = sum[k * 3 + 2]! + f[q + 2]!;
    }
  }
  const used = [...count.keys()].filter((k) => count[k]! > 0).sort((a, b) => count[b]! - count[a]!);
  const palette: [number, number, number][] = used.slice(0, 256).map((k) => [
    Math.round(sum[k * 3]! / count[k]!),
    Math.round(sum[k * 3 + 1]! / count[k]!),
    Math.round(sum[k * 3 + 2]! / count[k]!),
  ]);
  // each bucket's nearest palette colour, worked out once
  const nearest = new Int16Array(32768).fill(-1);
  const indexOf = (r: number, g: number, b: number) => {
    const k = key(r, g, b);
    let best = nearest[k]!;
    if (best < 0) {
      let d = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const [pr, pg, pb] = palette[i]!;
        const e = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
        if (e < d) {
          d = e;
          best = i;
        }
      }
      nearest[k] = best;
    }
    return best;
  };
  return { palette, indexOf };
}

/** GIF's LZW: 8-bit symbols, clear code 256, end code 257, codes up to 12 bits, packed low bit first. */
function lzw(indices: Uint8Array): Uint8Array {
  const CLEAR = 256;
  const END = 257;
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = 9;
  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  let dict = new Map<number, number>();
  let next = 258;
  emit(CLEAR);
  let prefix = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const entry = (prefix << 8) | k;
    const found = dict.get(entry);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(entry, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      // the table is full: start again
      emit(CLEAR);
      dict = new Map();
      next = 258;
      codeSize = 9;
    }
    prefix = k;
  }
  emit(prefix);
  emit(END);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return Uint8Array.from(bytes);
}

class ByteWriter {
  private parts: number[] = [];
  byte(b: number) {
    this.parts.push(b & 0xff);
  }
  bytes(bs: ArrayLike<number>) {
    for (let k = 0; k < bs.length; k++) this.parts.push(bs[k]! & 0xff);
  }
  u16(n: number) {
    this.byte(n & 0xff);
    this.byte(n >> 8);
  }
  text(s: string) {
    for (const ch of s) this.byte(ch.charCodeAt(0));
  }
  result() {
    return Uint8Array.from(this.parts);
  }
}
