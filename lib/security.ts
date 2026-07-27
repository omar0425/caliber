import { NextRequest } from "next/server";
import { getBudget } from "./settings";
import { getUsageSummary } from "./usage";

const WINDOW_MS = 60_000;
const MAX_AI_REQUESTS = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 10);
const hits = new Map<string, { count: number; resetAt: number }>();

export class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function enforceContentLength(req: NextRequest, maximumBytes: number): void {
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximumBytes) {
    throw new RequestError("Request payload is too large.", 413);
  }
}

export function enforceContentType(req: NextRequest, expected: string): void {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== expected.toLowerCase()) {
    throw new RequestError(`Content-Type must be ${expected}.`, 415);
  }
}

function clientId(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function enforceAiRateLimit(req: NextRequest): void {
  const now = Date.now();
  if (hits.size > 5_000) {
    for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
  }
  const id = clientId(req);
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
