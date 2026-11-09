// The AI sometimes writes its caveats into identity fields:
//   brand:     "Acme Comics (licensed superhero watch; actual manufacturer not identified)"
//   reference: "ZX-200B10A (base reference ZX-200B; JDM equivalent ZY-200B)"
// That breaks search, sorting, duplicate detection, and the appraisal. Keep the
// identity fields to the identity itself and move the note into the summary,
// so nothing the model said is lost.

type Identity = { brand: string; referenceNumber: string | null; summary: string };

const UNKNOWN_MAKER = /^(unknown|unbranded|unidentified|not (visible|identified)|no visible)/i;

function splitNote(value: string): { head: string; note: string | null } {
  const match = /^(.*?)\s*[(;]\s*(.+?)\)?\s*$/.exec(value);
  if (!match || !match[1].trim()) return { head: value.trim(), note: null };
  return { head: match[1].trim(), note: match[2].trim() };
}

export function cleanIdentity<T extends Identity>(spec: T): T {
  const notes: string[] = [];
  let { brand, referenceNumber } = spec;

  if (brand) {
    const { head, note } = splitNote(brand);
    if (UNKNOWN_MAKER.test(brand) && brand.length > 12) {
      notes.push(`Maker: ${brand.trim()}.`);
      brand = "Unknown";
    } else if (note) {
      notes.push(`Maker note: ${note}.`);
      brand = head;
    }
  }

  if (referenceNumber) {
    const { head, note } = splitNote(referenceNumber);
    if (note) {
      notes.push(`Reference note: ${note}.`);
      referenceNumber = head || null;
    }
  }

  if (notes.length === 0) return spec;
  const summary = [spec.summary?.trim(), ...notes].filter(Boolean).join(" ");
  return { ...spec, brand, referenceNumber, summary };
}
