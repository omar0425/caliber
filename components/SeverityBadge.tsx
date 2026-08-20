// Authenticity signals. Severity is NEVER colour alone: each level has its own
// shape and a text label, so every signal survives greyscale and color-vision
// deficiency. Colour is strictly the third channel.

const SEVERITY = {
  red: { label: "High risk", color: "var(--color-danger)" },
  yellow: { label: "Caution", color: "var(--color-warn)" },
  green: { label: "OK", color: "var(--color-good)" },
} as const;

export type Severity = keyof typeof SEVERITY;

function SeverityShape({ severity, size = 14 }: { severity: Severity; size?: number }) {
  const color = SEVERITY[severity].color;
  if (severity === "red") {
    // Triangle — the strongest alert silhouette
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <path d="M8 2.5 L14.5 13.5 H1.5 Z" fill={color} />
      </svg>
    );
  }
  if (severity === "yellow") {
    // Diamond — middle signal
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1" transform="rotate(45 8 8)" fill={color} />
      </svg>
    );
  }
  // Circle — all clear
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6" fill={color} />
    </svg>
  );
}

export function SeverityBadge({ severity, className = "" }: { severity: Severity; className?: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.green;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}>
      <SeverityShape severity={severity} />
      <span className="text-sm font-semibold" style={{ color: s.color }}>
        {s.label}
      </span>
    </span>
  );
}

const VERDICT = {
  "likely-authentic": { label: "Looks consistent", color: "var(--color-good)", Icon: VerdictCheck },
  caution: { label: "Proceed with caution", color: "var(--color-warn)", Icon: VerdictWarn },
  "likely-problematic": { label: "Red flags found", color: "var(--color-danger)", Icon: VerdictAlert },
  inconclusive: { label: "Inconclusive", color: "var(--color-muted)", Icon: VerdictQuestion },
} as const;

export type Verdict = keyof typeof VERDICT;

function VerdictCheck({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8" stroke={color} strokeWidth="1.8" />
      <path d="M6.5 10.2l2.4 2.4 4.6-4.8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function VerdictWarn({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 2.8 L17.5 16 H2.5 Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 7.5v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="13.6" r="1" fill={color} />
    </svg>
  );
}
function VerdictAlert({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8" stroke={color} strokeWidth="1.8" />
      <path d="M7 7l6 6M13 7l-6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function VerdictQuestion({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8" stroke={color} strokeWidth="1.8" />
      <path d="M7.4 7.6a2.7 2.7 0 115 1.5c-.5 1.1-2.2 1.4-2.2 2.9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10.1" cy="14.6" r="1" fill={color} />
    </svg>
  );
}

export function VerdictBadge({
  verdict,
  confidence,
  compact = false,
}: {
  verdict: Verdict;
  confidence?: number;
  compact?: boolean;
}) {
  const v = VERDICT[verdict] ?? VERDICT.inconclusive;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <v.Icon color={v.color} />
      <span
        className={compact ? "font-semibold leading-snug" : "font-serif text-2xl leading-tight"}
        style={{ color: v.color }}
      >
        {v.label}
      </span>
      {typeof confidence === "number" && (
        <span className="text-muted">{confidence}% confidence</span>
      )}
    </span>
  );
}
