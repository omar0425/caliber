// One way to call Caliber's API from the browser: checks the HTTP status,
// tolerates non-JSON error pages (a proxy 502 is HTML), and turns network
// failures into sentences a collector can act on instead of Safari's
// "The string did not match the expected pattern." / "Load failed".

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function messageForStatus(status: number): string {
  if (status === 401) return "Your sign-in expired. Refresh the page and sign in again.";
  if (status === 402) return "The monthly AI budget has been reached. Raise it in Settings to continue.";
  if (status === 404) return "That item no longer exists. Refresh the page.";
  if (status === 413) return "That file is too large. Try a smaller photo.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "Caliber hit a problem on the server. Try again in a moment.";
  return "Something went wrong. Please try again.";
}

export type FetchJsonInit = RequestInit & {
  // Abort and report a timeout after this many milliseconds.
  timeoutMs?: number;
};

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  { timeoutMs, ...init }: FetchJsonInit = {}
): Promise<T> {
  const controller = timeoutMs && !init.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(input, controller ? { ...init, signal: controller.signal } : init);
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new ApiError("That took too long. Check your connection and try again.", 0);
    }
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Couldn't reach Caliber. Check your connection and try again.", 0);
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data: unknown = null;
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const serverMessage =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;
    throw new ApiError(serverMessage || messageForStatus(res.status), res.status);
  }
  return (data ?? {}) as T;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
