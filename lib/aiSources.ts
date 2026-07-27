import type { Response } from "openai/resources/responses/responses";

export function normalizeHttpSource(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeHttpSources(values: unknown[], maximum = 12): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeHttpSource(value);
    if (normalized) unique.add(normalized);
    if (unique.size >= maximum) break;
  }
  return [...unique];
}

// Structured output fields are model-generated and may contain invented URLs.
// Use the Responses API's own web-search source metadata as the source of truth.
export function extractWebSources(response: Pick<Response, "output">): string[] {
  const found: unknown[] = [];

  for (const item of response.output) {
    if (item.type === "web_search_call") {
      if (item.action.type === "search") {
        for (const source of item.action.sources ?? []) found.push(source.url);
      } else if (item.action.type === "open_page" || item.action.type === "find_in_page") {
        found.push(item.action.url);
      }
      continue;
    }

    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations) {
        if (annotation.type === "url_citation") found.push(annotation.url);
      }
    }
  }

  return normalizeHttpSources(found);
}
