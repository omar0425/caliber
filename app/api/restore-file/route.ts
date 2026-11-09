import { NextRequest, NextResponse } from "next/server";
import { restoreStoredFile } from "@/lib/upload";
import { INCOMPLETE_BODY_MESSAGE, readBodyBytes, RequestError } from "@/lib/security";
import { crc32 } from "@/lib/zip";
import { recordFailure } from "@/lib/errorLog";

export const runtime = "nodejs";

const MAX_RESTORE_FILE_BYTES = 21 * 1024 * 1024;

// POST /api/restore-file?name=<stored name>&size=<bytes>&crc=<crc32>
//   (body: the file's bytes)
// One photo or document from a full-backup ZIP, put back under its original
// name. Existing files are never overwritten — so a damaged copy written once
// could never be repaired by a later good restore. The body is therefore
// checked before anything is written (B4): it must be exactly as long as its
// Content-Length (the proxy cuts large bodies silently) and, when the client
// sends them, match the size and CRC-32 recorded in the backup ZIP.
// Called once per file by the Settings restore so a large backup never goes
// up as a single request.
export async function POST(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const name = params.get("name") ?? "";
    const bytes = await readBodyBytes(req, MAX_RESTORE_FILE_BYTES);
    if (bytes.length === 0) throw new RequestError("Empty file.", 400);
    const size = params.get("size");
    if (size !== null && (!/^\d{1,12}$/.test(size) || Number(size) !== bytes.length)) {
      throw new RequestError(INCOMPLETE_BODY_MESSAGE, 400);
    }
    const crc = params.get("crc");
    if (crc !== null && (!/^\d{1,10}$/.test(crc) || Number(crc) !== crc32(bytes))) {
      throw new RequestError("That file is damaged in the backup (its checksum doesn't match), so it was not restored.", 400);
    }
    const result = await restoreStoredFile(name, bytes);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    await recordFailure("api/restore-file", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Could not restore that file." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
