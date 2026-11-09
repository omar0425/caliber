type Point = { date: string; value: number };

function abbr(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function fullValue(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

type Frame = { W: number; H: number; padL: number; padR: number; padT: number; padB: number; font: number };

// Desktop and phone draw the same series; the phone frame is narrower with
// larger relative type so labels stay ≥13px when the SVG scales to ~343px.
const DESKTOP: Frame = { W: 760, H: 260, padL: 52, padR: 16, padT: 16, padB: 30, font: 14 };
const PHONE: Frame = { W: 343, H: 190, padL: 46, padR: 10, padT: 12, padB: 26, font: 13 };

function ChartSvg({ data, frame, className, gradientId }: { data: Point[]; frame: Frame; className: string; gradientId: string }) {
  const { W, H, padL, padR, padT, padB, font } = frame;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // Flat series — pad so the line sits mid-chart.
    min = min * 0.9;
    max = max * 1.1 || 1;
  }
  const pad = (max - min) * 0.1;
  min = Math.max(0, min - pad);
  max = max + pad;

  const x = (i: number) => (data.length === 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const areaPath =
    `M ${x(0).toFixed(1)} ${(padT + plotH).toFixed(1)} ` +
    data.map((d, i) => `L ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ") +
    ` L ${x(data.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const gridVals = [max, min + (max - min) * 0.5, min];

  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: "auto" }} role="img" aria-label="Collection value over time">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gridlines + y labels */}
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={font} fill="var(--color-muted)">
            {abbr(v)}
          </text>
        </g>
      ))}

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* end dot */}
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="4" fill="var(--color-accent-soft)" />

      {/* x labels: first & last */}
      <text x={padL} y={H - 8} fontSize={font} fill="var(--color-muted)">{data[0].date}</text>
      {data.length > 1 && (
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize={font} fill="var(--color-muted)">
          Today
        </text>
      )}
    </svg>
  );
}

// The last point is always "now" (lib/portfolio.ts) and is labelled "Today"
// rather than dated: its server-side UTC date already reads tomorrow on a US
// evening.
// Dependency-free area/line chart. Renders as scalable SVG — a phone-sized
// version below `sm` (it used to be hidden entirely on phones).
export default function ValueChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-center text-muted leading-relaxed px-2">
        No valuation history yet — add watches and refresh their values over time.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:hidden" aria-label="Value chart summary">
        <div className="rounded-xl border border-line bg-surface-2/50 p-3 min-w-0">
          <p className="text-[0.95rem] font-semibold text-muted">First valued</p>
          <p className="text-lg text-accent-soft mt-1 break-words">{fullValue(data[0].value)}</p>
          <p className="text-[0.95rem] text-muted break-words">{data[0].date}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/50 p-3 min-w-0">
          <p className="text-[0.95rem] font-semibold text-muted">Today</p>
          <p className="text-lg text-accent-soft mt-1 break-words">
            {fullValue(data[data.length - 1].value)}
          </p>
          <p className="text-[0.95rem] text-muted break-words">current estimate</p>
        </div>
      </div>
      <ChartSvg data={data} frame={PHONE} className="sm:hidden" gradientId="valfill-phone" />
      <ChartSvg data={data} frame={DESKTOP} className="hidden sm:block" gradientId="valfill" />
      <p className="text-sm leading-relaxed text-muted">
        The line rises when you add watches as well as when their values change.
      </p>
    </div>
  );
}
