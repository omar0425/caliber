import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: db.queryRaw },
}));

import { GET } from "./route";

afterEach(() => {
  db.queryRaw.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/api/health", () => {
  it("returns 200 when the database answers SELECT 1", async () => {
    db.queryRaw.mockResolvedValue([{ 1: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [strings] = db.queryRaw.mock.calls[0];
    expect(String(strings.join("?")).trim()).toBe("SELECT 1");
  });

  it("returns 503 without leaking the error when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.queryRaw.mockRejectedValue(new Error("SQLITE_CANTOPEN: unable to open /app/data/caliber.db"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain("caliber.db");
  });

  it("returns 503 when the database hangs instead of answering", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.useFakeTimers();
    db.queryRaw.mockReturnValue(new Promise(() => undefined));
    const pending = GET();
    await vi.advanceTimersByTimeAsync(3_100);
    const response = await pending;
    expect(response.status).toBe(503);
  });
});
