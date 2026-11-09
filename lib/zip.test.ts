import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crc32, readAll, unzip, zipStream } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(text("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("round-trips a backup (JSON + binary files + an empty file)", async () => {
    const photo = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const bytes = await readAll(
      zipStream(
        (async function* () {
          yield { name: "caliber-backup.json", data: text('{"watches":[]}') };
          yield { name: "uploads/abcdef0123456789abcd.jpg", data: photo };
          yield { name: "uploads/empty.txt", data: new Uint8Array() };
        })()
      )
    );
    const entries = await unzip(bytes);
    expect(entries.map((e) => e.name)).toEqual([
      "caliber-backup.json",
      "uploads/abcdef0123456789abcd.jpg",
      "uploads/empty.txt",
    ]);
    expect(new TextDecoder().decode(entries[0].data)).toBe('{"watches":[]}');
    expect(entries[1].data).toEqual(photo);
    expect(entries[2].data.length).toBe(0);
    // The CRC-32 the archive recorded travels with each entry (restore sends
    // it so the server can refuse a damaged or cut-off file).
    expect(entries[1].crc).toBe(crc32(photo));
    expect(entries[2].crc).toBe(0);
  });

  it("reads deflated entries written by other tools", async () => {
    // Hand-build a one-entry ZIP using DEFLATE (method 8).
    const name = text("note.txt");
    const content = text("watch ".repeat(200));
    const packed = deflateRawSync(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(content), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(content), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const centralOffset = local.length + name.length + packed.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(centralOffset, 16);
    const zip = Buffer.concat([local, name, packed, central, name, end]);

    const [entry] = await unzip(new Uint8Array(zip));
    expect(entry.name).toBe("note.txt");
    expect(new TextDecoder().decode(entry.data)).toBe("watch ".repeat(200));
  });

  it("rejects files that aren't ZIPs", async () => {
    await expect(unzip(text("not a zip at all, just text"))).rejects.toThrow(/isn't a ZIP/);
  });
});
