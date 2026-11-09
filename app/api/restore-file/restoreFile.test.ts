// B4 (review of a75d740): a file cut off by the proxy (or damaged in the ZIP)
// is refused and never written. restore-file never overwrites, so a bad copy
// written once could not be repaired later. Real route, scratch UPLOAD_DIR.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createScratchDatabase } from "@/test/scratchDb";
import { crc32 } from "@/lib/zip";

let scratch: ReturnType<typeof createScratchDatabase>;
let prisma: PrismaClient;
let POST: (req: NextRequest) => Promise<Response>;
let uploads: string;

beforeAll(async () => {
  scratch = createScratchDatabase("restore-file");
  uploads = process.env.UPLOAD_DIR!;
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("./route"));
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  scratch?.cleanup();
});

// A 15 MB "PDF" (signature + filler), the size the review saw stored as 10 MiB.
function pdf(bytes: number): Buffer {
  const data = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) data[i] = (i * 131 + 7) % 251;
  data.write("%PDF-1.7\n", 0, "latin1");
  return data;
}

function restore(name: string, body: Buffer, query = "", headers: Record<string, string> = {}) {
  return POST(
    new NextRequest(`https://caliber.test/api/restore-file?name=${name}${query}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...headers },
      body: new Uint8Array(body),
    })
  );
}

const stored = () => readdirSync(uploads).filter((f) => !f.startsWith("."));

describe("restore-file", () => {
  it("stores a 15 MB PDF byte-identical when size and CRC match", async () => {
    const data = pdf(15 * 1024 * 1024);
    const name = "1111111111111111aaaa.pdf";
    const response = await restore(name, data, `&size=${data.length}&crc=${crc32(data)}`, {
      "content-length": String(data.length),
    });
    expect(await response.json()).toEqual({ ok: true, result: "restored" });
    expect(readFileSync(path.join(uploads, name)).equals(data)).toBe(true);
  });

  it("refuses a body shorter than its Content-Length and writes nothing", async () => {
    const data = pdf(2 * 1024 * 1024);
    const name = "2222222222222222aaaa.pdf";
    const cut = data.subarray(0, 1024 * 1024);
    const response = await restore(name, cut, "", { "content-length": String(data.length) });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/arrived incomplete/);
    expect(existsSync(path.join(uploads, name))).toBe(false);
  });

  it("refuses a file whose size differs from the backup's record", async () => {
    const data = pdf(1024 * 1024);
    const name = "3333333333333333aaaa.pdf";
    const response = await restore(name, data.subarray(0, 512 * 1024), `&size=${data.length}&crc=${crc32(data)}`);
    expect(response.status).toBe(400);
    expect(existsSync(path.join(uploads, name))).toBe(false);
  });

  it("refuses a file whose CRC-32 differs from the ZIP's record (one flipped byte)", async () => {
    const data = pdf(256 * 1024);
    const name = "4444444444444444aaaa.pdf";
    const damaged = Buffer.from(data);
    damaged[1000] ^= 0xff;
    const response = await restore(name, damaged, `&size=${data.length}&crc=${crc32(data)}`);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/checksum/);
    expect(existsSync(path.join(uploads, name))).toBe(false);
  });

  it("leaves no temporary or partial files behind after refusals", () => {
    expect(stored()).toEqual(["1111111111111111aaaa.pdf"]);
  });
});
