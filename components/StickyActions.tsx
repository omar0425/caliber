// Keeps a screen's main action within thumb reach on phones: while its
// section is on screen it is pinned just above the bottom tab bar instead of
// sitting several screens down. From `lg` up (no tab bar) it renders inline.
//
// Sticky positioning only works inside its parent's box, so place this as a
// direct child of the container whose length it should follow.
export default function StickyActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px)+0.5rem)] z-30 space-y-2 rounded-xl border border-line/70 bg-surface/95 p-3 shadow-overlay backdrop-blur lg:static lg:space-y-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
      {children}
    </div>
  );
}
