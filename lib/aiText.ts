// AI answers grounded with web search arrive with Markdown and inline
// citations — "**Yes.** … ([example-retailer.com](https://…?utm_source=openai))".
// Caliber lists sources separately, so inline citations are noise, and the
// app renders plain text, so the Markdown syntax showed up literally.

// " ([site.com](https://…))" and "[site.com](https://…)" citation forms.
const PAREN_CITATION = /\s*\(\[[^\]]*\]\(https?:\/\/[^)\s]*\)\)/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\(https?:\/\/[^)\s]*\)/g;
const BOLD = /\*\*([^*]+)\*\*|__([^_]+)__/g;

export function stripCitations(text: string): string {
  return text
    .replace(PAREN_CITATION, "")
    .replace(MARKDOWN_LINK, "$1")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// For places that show plain prose (spec sheet fields).
export function cleanAiText(text: string | null | undefined): string {
  if (!text) return "";
  return stripCitations(text).replace(BOLD, (_m, a: string, b: string) => a ?? b);
}

export type AiBlock =
  | { kind: "paragraph"; parts: AiInline[] }
  | { kind: "list"; ordered: boolean; items: AiInline[][] };
export type AiInline = { text: string; bold: boolean };

function inline(text: string): AiInline[] {
  const parts: AiInline[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), bold: false });
    parts.push({ text: match[1] ?? match[2], bold: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

// Minimal, safe Markdown for chat answers: paragraphs, bullet/numbered
// lists, and bold. Produces data, never HTML.
export function parseAiMarkdown(text: string): AiBlock[] {
  const blocks: AiBlock[] = [];
  for (const chunk of stripCitations(text).split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
    if (lines.length === 0) continue;
    if (lines.every((line) => BULLET.test(line))) {
      blocks.push({
        kind: "list",
        ordered: /^\s*\d/.test(lines[0]),
        items: lines.map((line) => inline(line.replace(BULLET, ""))),
      });
    } else {
      blocks.push({ kind: "paragraph", parts: inline(lines.map((line) => line.replace(/^#{1,6}\s+/, "")).join("\n")) });
    }
  }
  return blocks;
}
