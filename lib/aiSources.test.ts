import { describe, expect, it } from "vitest";
import type { Response } from "openai/resources/responses/responses";
import { extractWebSources, normalizeHttpSources } from "./aiSources";

describe("AI source handling", () => {
  it("keeps only safe HTTP sources and removes duplicates", () => {
    expect(
      normalizeHttpSources([
        "https://example.com/watch#specs",
        "https://example.com/watch",
        "javascript:alert(1)",
        "not a URL",
      ])
    ).toEqual(["https://example.com/watch"]);
  });

  it("extracts authoritative web-search sources and citations", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            sources: [
              { type: "url", url: "https://manufacturer.example/reference" },
              { type: "url", url: "javascript:alert(1)" },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://market.example/value",
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Pick<Response, "output">;

    expect(extractWebSources(response)).toEqual([
      "https://manufacturer.example/reference",
      "https://market.example/value",
    ]);
  });
});
