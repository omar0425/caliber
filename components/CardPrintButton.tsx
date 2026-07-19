"use client";

// A small print button that overlays a watch card. Opens that single watch's
// page in print mode (?print=1) in a new tab, which auto-triggers the print
// dialog — so it prints only that one watch, never the whole collection.
export default function CardPrintButton({ watchId, label }: { watchId: string; label: string }) {
  return (
    <button
      type="button"
      title="Print / Save as PDF"
      aria-label={`Print ${label}`}
      onClick={(e) => {
        // The card is a link; don't navigate to the detail page on click.
        e.preventDefault();
        e.stopPropagation();
        window.open(`/watch/${watchId}?print=1`, "_blank", "noopener");
      }}
      className="absolute top-2 right-2 z-10 flex items-center justify-center w-9 h-9 rounded-lg bg-base/70 backdrop-blur border border-line text-muted hover:text-accent hover:border-accent transition-[color,border-color,opacity] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
    >
      {/* printer icon */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    </button>
  );
}
