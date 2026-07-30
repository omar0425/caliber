import { prisma } from "./prisma";

// Persistent error log.
//
// Errors used to go only to console.error, which lands in the hosting
// provider's dashboard — unreachable from the phone the app is actually used
// on. These entries are stored in the database (so they survive redeploys on
// the volume) and shown in Settings → Error log, where they can be copied for
// a bug report.
//
// Three rules this module must never break:
//  1. Logging must never fail a request — every write is best-effort.
//  2. Secrets must never be persisted (see redactSecrets).
//  3. The table must stay small; it shares the volume with the collection.

export const MAX_ERROR_LOG_ROWS = 500;
const PRUNE_SLACK = 50; // prune in batches instead of on every single write
const MAX_MESSAGE_CHARS = 500;
const MAX_DETAIL_CHARS = 4_000;

export type ErrorLevel = "error" | "warn";

// Strip anything credential-shaped before it can be written to the database or
// copied into a bug report.
export function redactSecrets(input: string): string {
  let text = input;

  // Exact secrets from the environment, whatever shape they take.
  for (const name of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "CALIBER_AUTH_SECRET",
    "CALIBER_AUTH_USER",
  ]) {
    const value = process.env[name]?.trim();
    if (value && value.length >= 8) {
      text = text.split(value).join(`[${name} redacted]`);
    }
  }

  return (
    text
      // Provider API keys (OpenAI sk-…, Anthropic sk-ant-…, generic project keys).
      .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[api key redacted]")
      // Authorization headers and bearer tokens.
      .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]")
      // password / secret / token / apiKey in JSON or query form.
      .replace(
        /("?\b(?:password|secret|token|api[_-]?key|authorization)\b"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,&}]+)/gi,
        "$1[redacted]"
      )
      // Signed-upload signatures — short-lived, but no reason to store them.
      .replace(/\bsig=[A-Za-z0-9._~+/=-]{8,}/g, "sig=[redacted]")
      // Session cookie values.
      .replace(/\bcaliber_session=[^\s;]+/g, "caliber_session=[redacted]")
      // Base64 blobs (image payloads) — huge and useless in a log.
      .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[binary omitted]")
  );
}

function clamp(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}… [truncated]` : text;
}

// Turn an unknown thrown value into a message + detail pair.
export function describeError(error: unknown): { message: string; detail: string | null } {
  if (error instanceof Error) {
    const detail = [error.name, error.stack, (error as { cause?: unknown }).cause]
      .filter(Boolean)
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");
    return { message: error.message || error.name, detail: detail || null };
  }
  if (typeof error === "string") return { message: error, detail: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), detail: null };
  } catch {
    return { message: String(error), detail: null };
  }
}

async function prune(): Promise<void> {
  const count = await prisma.errorLog.count();
  if (count <= MAX_ERROR_LOG_ROWS + PRUNE_SLACK) return;
  // SQLite has no "delete with offset", so select the survivors' cutoff first.
  const oldest = await prisma.errorLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_ERROR_LOG_ROWS,
    select: { id: true },
  });
  if (oldest.length === 0) return;
  await prisma.errorLog.deleteMany({ where: { id: { in: oldest.map((row) => row.id) } } });
}

export type RecordErrorInput = {
  source: string; // "api/identify", "ui/watch-page", …
  message: string;
  detail?: string | null;
  status?: number | null;
  level?: ErrorLevel;
};

// Persist one entry. Never throws — a broken logger must not break the app.
export async function recordError(input: RecordErrorInput): Promise<void> {
  try {
    await prisma.errorLog.create({
      data: {
        level: input.level ?? "error",
        source: clamp(redactSecrets(input.source), 120) || "unknown",
        message: clamp(redactSecrets(input.message), MAX_MESSAGE_CHARS) || "Unknown error",
        detail: input.detail ? clamp(redactSecrets(input.detail), MAX_DETAIL_CHARS) : null,
        status: typeof input.status === "number" ? input.status : null,
      },
    });
    await prune();
  } catch (loggingError) {
    // Deliberately swallowed: the original failure has already been reported to
    // the caller, and a logging problem must not replace it.
    console.error("[errorLog] could not persist entry", loggingError);
  }
}

// Convenience for API catch blocks: console + database in one call.
// Severity defaults from the HTTP status so the log stays scannable — a 4xx is
// a rejected request (warn), while a 5xx or an unhandled throw is a genuine
// fault (error).
export async function recordFailure(
  source: string,
  error: unknown,
  options: { status?: number | null; level?: ErrorLevel } = {}
): Promise<void> {
  console.error(`${source} failed`, error);
  const { message, detail } = describeError(error);
  const status = options.status;
  const level =
    options.level ?? (typeof status === "number" && status >= 400 && status < 500 ? "warn" : "error");
  await recordError({ source, message, detail, status, level });
}

export type ErrorLogEntry = {
  id: string;
  createdAt: string;
  level: string;
  source: string;
  message: string;
  detail: string | null;
  status: number | null;
};

export async function listErrors(limit = 50): Promise<ErrorLogEntry[]> {
  const rows = await prisma.errorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    level: row.level,
    source: row.source,
    message: row.message,
    detail: row.detail,
    status: row.status,
  }));
}

export async function clearErrors(): Promise<number> {
  const { count } = await prisma.errorLog.deleteMany({});
  return count;
}
