type Point = { date: string; value: number };

function abbr(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

// Dependency-free area/line chart. Renders as scalable SVG.
export default function ValueChart({ data, height = 260 }: { data: Point[]; height?: number }) {
  const W = 760;
  const H = height;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted text-sm">
        No valuation history yet — add watches and refresh their values over time.
      </div>
    );
  }

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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: "auto" }} role="img" aria-label="Collection value over time">
      <defs>
        <linearGradient id="valfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gridlines + y labels */}
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">
            {abbr(v)}
          </text>
        </g>
      ))}

      <path d={areaPath} fill="url(#valfill)" />
      <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* end dot */}
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="4" fill="var(--color-accent-soft)" />

      {/* x labels: first & last */}
      <text x={padL} y={H - 8} fontSize="11" fill="var(--color-muted)">{data[0].date}</text>
      {data.length > 1 && (
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize="11" fill="var(--color-muted)">
          {data[data.length - 1].date}
        </text>
      )}
    </svg>
  );
}
