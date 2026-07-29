import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

// UPLOAD_DIR is resolved at module load, so point it at a temp dir BEFORE
// importing the module under test.
let tempDir: string;
let upload: typeof import("./upload");

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caliber-upload-test-"));
  process.env.UPLOAD_DIR = tempDir;
  upload = await import("./upload");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function makeImageFile(): Promise<File> {
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 164, b: 92 } },
  })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(bytes)], "watch.jpg", { type: "image/jpeg" });
}

describe("pre-upload (Lens pre-check) helpers", () => {
  it("persists under the content-hash name and loads back with the same hash", async () => {
    const prepared = await upload.prepareUploadedImage(await makeImageFile());
    const saved = await upload.persistPreparedImageByHash(prepared);

    expect(saved.name).toBe(`${prepared.hash}.${prepared.extension}`);
    expect(saved.publicUrl).toBe(`/api/uploads/${saved.name}`);

    const loaded = await upload.loadPreUploadedImage(saved.name);
    // The recovered hash must equal the ORIGINAL-bytes hash so AI-cache keys
    // line up with images that arrive via the direct multipart path.
    expect(loaded.hash).toBe(prepared.hash);
    expect(loaded.mediaType).toBe(prepared.mediaType);
    expect(loaded.base64).toBe(prepared.base64);
  });

  it("re-uploading the same photo produces the same file (dedupe)", async () => {
    const a = await upload.persistPreparedImageByHash(
      await upload.prepareUploadedImage(await makeImageFile())
    );
    const b = await upload.persistPreparedImageByHash(
      await upload.prepareUploadedImage(await makeImageFile())
    );
    expect(a.name).toBe(b.name);
  });

  it("rejects non-hash names, traversal attempts, and unknown extensions", async () => {
    for (const bad of [
      "../../etc/passwd",
      "0123456789abcdefabcd.jpg", // 20-hex random name — not a pre-upload
      `${"a".repeat(64)}.pdf`,
      `${"g".repeat(64)}.jpg`, // not hex
      null,
      42,
    ]) {
      await expect(upload.loadPreUploadedImage(bad)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("404s for a valid-looking name that is not on disk", async () => {
    await expect(upload.loadPreUploadedImage(`${"ab".repeat(32)}.jpg`)).rejects.toMatchObject({
      status: 404,
    });
  });
});
