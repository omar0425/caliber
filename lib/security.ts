import { NextRequest } from "next/server";
import { getBudget } from "./settings";
import { getUsageSummary } from "./usage";
import { clientIp } from "./clientIp";

const WINDOW_MS = 60_000;
const MAX_AI_REQUESTS = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 10);
const hits = new Map<string, { count: number; resetAt: number }>();

export class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function enforceContentLength(req: Request, maximumBytes: number): void {
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximumBytes) {
    throw new RequestError("Request payload is too large.", 413);
  }
}

// Every request body passes through the auth proxy (proxy.ts). Next.js
// buffers a proxied body only up to experimental.proxyClientMaxBodySize
// (next.config.ts) and past that hands the route the first part of it WITHOUT
// an error (B4 in the a75d740 review: a 15 MB PDF was stored as exactly
// 10 MiB). Routes that store files or large JSON read their body through
// these helpers, which refuse a body that is larger than the route allows or
// shorter than the Content-Length the client declared, so a cut-off body is
// rejected and never stored.
export const INCOMPLETE_BODY_MESSAGE = "The upload arrived incomplete, so nothing was saved. Try again.";

export async function readBodyBytes(req: Request, maximumBytes: number): Promise<Buffer> {
  enforceContentLength(req, maximumBytes);
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > maximumBytes) throw new RequestError("Request payload is too large.", 413);
  const declared = req.headers.get("content-length");
  if (declared !== null && declared.trim() !== "") {
    const expected = Number(declared);
    if (!Number.isSafeInteger(expected) || expected !== bytes.length) {
      throw new RequestError(INCOMPLETE_BODY_MESSAGE, 400);
    }
  }
  return bytes;
}

export async function readJsonBody<T = unknown>(req: Request, maximumBytes: number): Promise<T> {
  const bytes = await readBodyBytes(req, maximumBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new RequestError("The request isn't valid JSON.", 400);
  }
}

export async function readFormDataBody(req: Request, maximumBytes: number): Promise<FormData> {
  const bytes = await readBodyBytes(req, maximumBytes);
  try {
    return await new Response(new Uint8Array(bytes), {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new RequestError("The upload couldn't be read. Try again.", 400);
  }
}

export function enforceContentType(req: NextRequest, expected: string): void {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== expected.toLowerCase()) {
    throw new RequestError(`Content-Type must be ${expected}.`, 415);
  }
}

export function enforceAiRateLimit(req: NextRequest): void {
  const now = Date.now();
  if (hits.size > 5_000) {
    for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
  }
  // Not the left-most X-Forwarded-For value, which the client controls (AUTH-3).
  const id = clientIp(req);
  const current = hits.get(id);
  if (!current || current.resetAt <= now) {
    hits.set(id, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > MAX_AI_REQUESTS) {
      throw new RequestError("Too many AI requests. Try again in a minute.", 429);
    }
  }
}

export async function enforceAiBudget(): Promise<void> {
  const [budget, usage] = await Promise.all([getBudget(), getUsageSummary()]);
  if (budget && usage.monthSpend >= budget) {
    throw new RequestError("The monthly AI budget has been reached.", 402);
  }
}

// Backward-compatible combined guard for callers that cannot check a free
// cache before deciding whether a paid OpenAI request is needed.
export async function enforceAiRequest(req: NextRequest): Promise<void> {
  enforceAiRateLimit(req);
  await enforceAiBudget();
}
