export type BrandConflict = {
  identifiedBrand: string;
  observedBrand: string;
};

function normalizedBrand(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findBrandConflict(
  identifiedBrand: string,
  observedBrand: string | null | undefined
): BrandConflict | null {
  if (!observedBrand?.trim()) return null;
  const identified = normalizedBrand(identifiedBrand);
  const observed = normalizedBrand(observedBrand);
  if (!identified || !observed) return null;
  if (identified.includes(observed) || observed.includes(identified)) return null;
  return {
    identifiedBrand: identifiedBrand.trim(),
    observedBrand: observedBrand.trim(),
  };
}

export function legacyDemoRecord(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => {
    const text = value?.toLowerCase() || "";
    return (
      text.includes("demo mode") ||
      text.includes("demo:") ||
      text.includes("anthropic api key")
    );
  });
}
