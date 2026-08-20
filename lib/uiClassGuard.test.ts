import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// In this app `text-base` is a COLOR utility (--color-base claims the name in
// Tailwind v4), so it paints text #050506 — the page background. Used as a
// "font size" it makes wording invisible on the dark theme; whether a paired
// color class rescues it depends on alphabetical rule order in the compiled
// CSS. See docs/TOKENS.md ("text-base is a COLOUR utility here").

const ROOT = path.resolve(__dirname, "..");

function tsxFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFilesUnder(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

describe("ui class guard", () => {
  it("never uses text-base — it is the page-background color, not a font size", () => {
    const offenders = ["app", "components"]
      .flatMap((dir) => tsxFilesUnder(path.join(ROOT, dir)))
      .filter((file) => /\btext-base\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file));
    expect(offenders, "drop text-base entirely (18px body size is the default; use text-lg to ask for it explicitly) and set color with text-ink/text-muted/text-accent*").toEqual([]);
  });
});
