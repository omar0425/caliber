// Minimal ZIP writer/reader for Caliber's full backup (backup JSON + every
// photo and document). Entries are STORED, not compressed: photos and PDFs are
// already compressed, so deflating them would only cost CPU. No dependency,
// works in Node (export route) and the browser (restore), and the writer
// streams entry by entry so a large collection never sits in memory at once.
//
// Limits (fine for a personal collection): < 65,535 entries, < 4 GB total.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export type ZipInput = { name: string; data: Uint8Array; modified?: Date };

const UTF8_FLAG = 0x0800;
const MAX_ENTRIES = 0xffff;
const MAX_OFFSET = 0xffffffff;

// Streams a ZIP built from `entries`, which may be produced lazily (e.g. one
// file read from disk at a time).
export function zipStream(entries: AsyncIterable<ZipInput> | Iterable<ZipInput>): ReadableStream<Uint8Array> {
  const central: Uint8Array[] = [];
  let offset = 0;
  let count = 0;
  const iterator =
    Symbol.asyncIterator in entries
      ? (entries as AsyncIterable<ZipInput>)[Symbol.asyncIterator]()
      : (entries as Iterable<ZipInput>)[Symbol.iterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (!next.done) {
        const entry = next.value;
        const name = encoder.encode(entry.name);
        const crc = crc32(entry.data);
        const size = entry.data.length;
        const { time, date } = dosDateTime(entry.modified ?? new Date());
        if (count + 1 > MAX_ENTRIES || offset + 30 + name.length + size > MAX_OFFSET) {
          controller.error(new Error("Backup is too large for a single ZIP."));
          return;
        }

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, UTF8_FLAG, true);
        lv.setUint16(8, 0, true); // stored
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, name.length, true);
        lv.setUint16(28, 0, true);
        local.set(name, 30);

        const header = new Uint8Array(46 + name.length);
        const cv = new DataView(header.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, UTF8_FLAG, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true);
        header.set(name, 46);
        central.push(header);

        controller.enqueue(local);
        if (size) controller.enqueue(entry.data);
        offset += local.length + size;
        count += 1;
        return;
      }

      const centralSize = central.reduce((sum, part) => sum + part.length, 0);
      for (const part of central) controller.enqueue(part);
      const end = new Uint8Array(22);
      const ev = new DataView(end.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, count, true);
      ev.setUint16(10, count, true);
      ev.setUint32(12, centralSize, true);
      ev.setUint32(16, offset, true);
      controller.enqueue(end);
      controller.close();
    },
  });
}

// crc: the CRC-32 the archive recorded for this entry (central directory),
// so a restore can prove each file arrives exactly as it was backed up.
export type ZipEntry = { name: string; data: Uint8Array; crc: number };

// Reads a ZIP held in memory. Stored entries are returned as views (no copy);
// deflated entries (a ZIP re-saved by another tool) are inflated with the
// platform's DecompressionStream where available.
export async function unzip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That file isn't a ZIP backup.");

  const total = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < total; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error("The ZIP backup is damaged.");
    const method = view.getUint16(pointer + 10, true);
    const crc = view.getUint32(pointer + 16, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    pointer += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue; // directory entry
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method === 0) {
      entries.push({ name, data: raw, crc });
    } else if (method === 8 && typeof DecompressionStream !== "undefined") {
      const inflated = await new Response(
        new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
      ).arrayBuffer();
      entries.push({ name, data: new Uint8Array(inflated), crc });
    } else {
      throw new Error("This ZIP was compressed in a way Caliber can't read. Use the original Caliber backup file.");
    }
  }
  return entries;
}

export async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
