import { afterEach, describe, expect, it, vi } from "vitest";

const openai = vi.hoisted(() => ({
  parse: vi.fn(),
  create: vi.fn(),
}));

vi.mock("openai", () => {
  class APIError extends Error {
    status?: number;
  }
  class OpenAI {
    static APIError = APIError;
    responses = { parse: openai.parse, create: openai.create };
  }
  return { default: OpenAI, APIError };
});
vi.mock("./settings", () => ({ getApiKey: vi.fn(async () => "sk-test-not-a-real-key") }));
vi.mock("./usage", () => ({ recordUsage: vi.fn(async () => undefined) }));

import { chatAboutWatch, identifyWatch, vetWatch } from "./ai";

const IMAGE = { base64: "aGVsbG8=", mediaType: "image/jpeg" };

afterEach(() => {
  openai.parse.mockReset();
  openai.create.mockReset();
});

describe("OpenAI requests ask for no storage", () => {
  it("identify sends store: false", async () => {
    openai.parse.mockRejectedValue(new Error("stop after capturing the request"));
    await expect(identifyWatch(IMAGE)).rejects.toThrow("stop after capturing");
    expect(openai.parse).toHaveBeenCalledTimes(1);
    expect(openai.parse.mock.calls[0][0]).toMatchObject({ store: false });
  });

  it("vet sends store: false", async () => {
    openai.parse.mockRejectedValue(new Error("stop after capturing the request"));
    await expect(vetWatch(IMAGE, "Rolex, mint, $500")).rejects.toThrow("stop after capturing");
    expect(openai.parse.mock.calls[0][0]).toMatchObject({ store: false });
  });

  it("chat sends store: false", async () => {
    openai.create.mockResolvedValue({ output_text: "A fine watch.", output: [] });
    const reply = await chatAboutWatch("Brand: Omega", [{ role: "user", content: "Is it rare?" }]);
    expect(reply.content).toBe("A fine watch.");
    expect(openai.create.mock.calls[0][0]).toMatchObject({ store: false });
  });
});
