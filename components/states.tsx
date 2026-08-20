import Link from "next/link";

// Shared state vocabulary — one look for loading, empty, error, and notice
// states across every route. All motion is CSS and stops globally under
// prefers-reduced-motion (stylesheet clamp), so these are safe everywhere.

/* A small escapement gear that turns while something loads. */
export function WindingMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={`winding-mark ${className}`} aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={24 + Math.cos(a) * 12}
            y1={24 + Math.sin(a) * 12}
            x2={24 + Math.cos(a + 0.14) * 18}
            y2={24 + Math.sin(a + 0.14) * 18}
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="24" cy="24" r="12" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="24" cy="24" r="2.4" fill="var(--color-accent-soft)" />
    </svg>
  );
}

/* Centered "the movement is winding" block for route-level loading. */
export function WindingState({ label = "Winding up…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" role="status" aria-label={label}>
      <WindingMark />
      <p className="text-base text-muted">{label}</p>
    </div>
  );
}

/* Skeleton building blocks for route loading.tsx files. */
export function Skel({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded bg-surface-2 ${className}`} aria-hidden="true" />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-6 sm:p-12 text-center space-y-3">
      <div className="flex justify-center opacity-70">
        <WindingMark size={44} className="winding-mark-still" />
      </div>
      <p className="text-lg font-medium">{title}</p>
      {body && <p className="text-base text-muted leading-relaxed max-w-md mx-auto">{body}</p>}
      {action && <div className="pt-2 flex justify-center">{action}</div>}
    </div>
  );
}

export function EmptyLinkAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn btn-gold inline-flex w-full min-[400px]:w-auto">
      {label}
    </Link>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="card min-w-0 space-y-4 p-6" role="alert">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="break-words rounded-lg border border-line/70 bg-surface-2/40 p-3 text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">
        {body}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-gold min-h-12 w-full text-base min-[400px]:w-auto">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

const NOTICE_TONE: Record<string, string> = {
  good: "text-good bg-good/10 border-good/30",
  warn: "text-warn bg-warn/10 border-warn/30",
  danger: "text-danger bg-danger/10 border-danger/30",
  muted: "text-muted bg-surface-2 border-line/60",
};

export function NoticeBanner({
  tone = "muted",
  children,
  role,
}: {
  tone?: keyof typeof NOTICE_TONE;
  children: React.ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <p role={role} className={`text-base border rounded-lg p-3 leading-relaxed ${NOTICE_TONE[tone]}`}>
      {children}
    </p>
  );
}
