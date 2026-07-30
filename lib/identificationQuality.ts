export type BrandConflict = {
  identifiedBrand: string;
  observedBrand: string;
};

function normalizedBrand(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// "The Bradford Exchange" and "Bradford Exchange" name the same maker.
function withoutLeadingArticle(value: string): string {
  return value.startsWith("the") ? value.slice(3) : value;
}

// Licensed character/franchise marks are dial ARTWORK, not a manufacturer's
// name. A Batman emblem or a Star Trek delta on the dial does not contradict a
// licensee maker such as The Bradford Exchange, Hope Industries, or Fossil —
// that is exactly how licensed watches are branded. Matching one of these only
// ever suppresses a FALSE refusal; genuine watch-brand contradictions
// (a dial reading BREITLING identified as an Omega) are unaffected because
// those marks are not on this list.
const LICENSED_PROPERTY_MARKS = [
  "batman", "superman", "wonderwoman", "greenlantern", "aquaman", "justiceleague",
  "dccomics", "gotham", "marvel", "spiderman", "ironman", "captainamerica",
  "avengers", "xmen", "startrek", "starfleet", "startrekthenextgeneration",
  "deepspacenine", "starwars", "mandalorian", "darthvader", "jedi",
  "disney", "mickeymouse", "minniemouse", "pixar", "harrypotter", "hogwarts",
  "pokemon", "pikachu", "hellokitty", "sanrio", "peanuts", "snoopy",
  "transformers", "jurassicpark", "ghostbusters", "looneytunes", "simpsons",
  "supermario", "nintendo", "sonicthehedgehog", "barbie", "hotwheels", "lego",
  "powerrangers", "teenagemutantninjaturtles", "gijoe", "hasbro",
];

function isLicensedPropertyMark(normalizedObserved: string): boolean {
  return LICENSED_PROPERTY_MARKS.some((mark) => normalizedObserved.includes(mark));
}

// When the collector's own hint names the identified brand, the model did not
// invent it — refusing would contradict what the owner explicitly told us.
function hintCorroboratesBrand(normalizedIdentified: string, hint: string | null | undefined): boolean {
  if (!hint?.trim()) return false;
  const normalizedHint = normalizedBrand(hint);
  if (!normalizedHint) return false;
  return [normalizedIdentified, withoutLeadingArticle(normalizedIdentified)]
    .filter((candidate) => candidate.length >= 4)
    .some((candidate) => normalizedHint.includes(candidate));
}

// Returns a conflict only when legible dial branding genuinely contradicts the
// identified brand — the case this guard exists for (a hallucinated maker).
// `hint` is whatever the collector typed into "Help Caliber identify it".
export function findBrandConflict(
  identifiedBrand: string,
  observedBrand: string | null | undefined,
  hint?: string | null
): BrandConflict | null {
  if (!observedBrand?.trim()) return null;
  const identified = normalizedBrand(identifiedBrand);
  const observed = normalizedBrand(observedBrand);
  if (!identified || !observed) return null;
  if (identified.includes(observed) || observed.includes(identified)) return null;

  // Same maker, different article ("The Bradford Exchange" vs "Bradford Exchange").
  const bareIdentified = withoutLeadingArticle(identified);
  const bareObserved = withoutLeadingArticle(observed);
  if (
    bareIdentified.length >= 4 &&
    bareObserved.length >= 4 &&
    (bareIdentified.includes(bareObserved) || bareObserved.includes(bareIdentified))
  ) {
    return null;
  }

  if (isLicensedPropertyMark(observed)) return null;
  if (hintCorroboratesBrand(identified, hint)) return null;

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
