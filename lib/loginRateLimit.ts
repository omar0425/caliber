import { NextRequest } from "next/server";

const WINDOW_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientId(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function currentFailure(req: NextRequest, now = Date.now()) {
  const id = clientId(req);
  const current = failures.get(id);
  if (current && current.resetAt <= now) {
    failures.delete(id);
    return { id, current: undefined };
  }
  return { id, current };
}

export function loginRetryAfter(req: NextRequest, now = Date.now()): number {
  const { current } = currentFailure(req, now);
  if (!current || current.count < MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
}

export function recordLoginFailure(req: NextRequest, now = Date.now()): number {
  if (failures.size > 5_000) {
    for (const [key, value] of failures) if (value.resetAt <= now) failures.delete(key);
  }
  const { id, current } = currentFailure(req, now);
  if (!current) {
    failures.set(id, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    current.count += 1;
  }
  return loginRetryAfter(req, now);
}

export function clearLoginFailures(req: NextRequest): void {
  failures.delete(clientId(req));
}
