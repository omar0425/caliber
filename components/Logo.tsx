export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="15" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="24" cy="24" r="1.8" fill="var(--color-accent)" />
      {/* crown */}
      <rect x="38" y="21.5" width="5" height="5" rx="1.2" fill="var(--color-accent)" />
      {/* lugs */}
      <path d="M17 10l2 4M31 10l-2 4M17 38l2-4M31 38l-2-4" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
      {/* hands */}
      <path d="M24 24V15M24 24l6 3" stroke="var(--color-accent-soft)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
