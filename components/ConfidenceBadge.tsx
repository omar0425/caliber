export default function ConfidenceBadge({ value }: { value: number }) {
  const tone =
    value >= 80 ? "var(--color-good)" : value >= 55 ? "var(--color-warn)" : "var(--color-danger)";
  const label = value >= 80 ? "High confidence" : value >= 55 ? "Moderate" : "Low — verify";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
      style={{ color: tone, borderColor: tone }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }} />
      {value}% · {label}
    </span>
  );
}
