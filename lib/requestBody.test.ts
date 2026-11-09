// B4 (review of a75d740): Next's proxy silently cuts request bodies above
// experimental.proxyClientMaxBodySize. These helpers make a cut body an error.
import { describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({ prisma: {} }));

import { readBodyBytes, readFormDataBody, readJsonBody, RequestError } from "./security";

function request(body: BodyInit, headers: Record<string, string>) {
  return new Request("https://caliber.test/api/x", { method: "POST", body, headers });
}

async function refusal(promise: Promise<unknown>): Promise<RequestError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RequestError) return error;
    throw error;
  }
  throw new Error("expected a RequestError");
}

describe("byte-checked request bodies", () => {
  it("accepts a body exactly as long as its Content-Length", async () => {
    const bytes = await readBodyBytes(request("hello", { "content-length": "5" }), 10);
    expect(bytes.toString()).toBe("hello");
  });

  it("accepts a body without a Content-Length (chunked) within the limit", async () => {
    expect((await readBodyBytes(request("hello", {}), 10)).length).toBe(5);
  });

  it("refuses a body shorter than its Content-Length (cut off by the proxy)", async () => {
    const error = await refusal(readBodyBytes(request("hel", { "content-length": "5" }), 10));
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/arrived incomplete/);
  });

  it("refuses a body larger than the route allows, declared or not", async () => {
    expect((await refusal(readBodyBytes(request("x".repeat(11), { "content-length": "11" }), 10))).status).toBe(413);
    expect((await refusal(readBodyBytes(request("x".repeat(11), {}), 10))).status).toBe(413);
  });

  it("parses JSON and turns a broken document into a 400", async () => {
    expect(await readJsonBody(request('{"a":1}', {}), 100)).toEqual({ a: 1 });
    expect(await readJsonBody(request('﻿{"a":1}', {}), 100)).toEqual({ a: 1 });
    expect((await refusal(readJsonBody(request('{"a":', {}), 100))).status).toBe(400);
  });

  it("parses multipart forms and refuses a cut-off one", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(4096).fill(7)], "scan.pdf", { type: "application/pdf" }));
    form.append("kind", "receipt");
    const whole = new Request("https://caliber.test/api/x", { method: "POST", body: form });
    const bytes = new Uint8Array(await whole.arrayBuffer());
    const contentType = whole.headers.get("content-type")!;

    const parsed = await readFormDataBody(
      request(bytes, { "content-type": contentType, "content-length": String(bytes.length) }),
      1024 * 1024
    );
    const file = parsed.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).size).toBe(4096);
    expect(parsed.get("kind")).toBe("receipt");

    const cut = bytes.subarray(0, 2048);
    const error = await refusal(
      readFormDataBody(request(cut, { "content-type": contentType, "content-length": String(bytes.length) }), 1024 * 1024)
    );
    expect(error.status).toBe(400);
    // Even without a Content-Length, a multipart body missing its end is refused.
    expect((await refusal(readFormDataBody(request(cut, { "content-type": contentType }), 1024 * 1024))).status).toBe(400);
  });
});

describe("proxy body buffer", () => {
  it("next.config sets proxyClientMaxBodySize above every route's body limit", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const config = (await import("../next.config")).default;
    expect(config.experimental?.proxyClientMaxBodySize).toBe("26mb");
    const proxyLimit = 26 * 1024 * 1024;

    const root = path.join(__dirname, "..", "app", "api");
    const routes = (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith("route.ts"));
    let checked = 0;
    for (const route of routes) {
      const source = readFileSync(path.join(root, route), "utf8");
      for (const match of source.matchAll(/(\d+)\s*\*\s*1024\s*\*\s*1024/g)) {
        checked += 1;
        expect(Number(match[1]) * 1024 * 1024, `${route} allows ${match[1]} MB`).toBeLessThan(proxyLimit);
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
});
