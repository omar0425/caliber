// Valuation sources written by the AI flows. Anything else (a dealer quote,
// Chrono24, "Manual entry", an import) was recorded by the collector and must
// be treated as their number, not something the app may discard.
const AI_SOURCES = new Set(["ai estimate", "openai re-analysis"]);

export function isAiValuationSource(source: string | null | undefined): boolean {
  return AI_SOURCES.has((source ?? "").trim().toLowerCase());
}
