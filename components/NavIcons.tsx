type P = { className?: string };
const base = "none";

export function HomeIcon({ className }: P) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </svg>
  );
}
export function CameraIcon({ className }: P) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
export function GridIcon({ className }: P) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
export function ChartIcon({ className }: P) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16h16" />
      <path d="M8 16v-3M12 16V9M16 16v-6" />
    </svg>
  );
}
export function ShieldIcon({ className }: P) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
export function GearIcon({ className }: P) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  );
}
