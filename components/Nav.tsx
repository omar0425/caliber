"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { HomeIcon, CameraIcon, GridIcon, ChartIcon, ShieldIcon, GearIcon, ClockIcon } from "./NavIcons";

const LINKS = [
  { href: "/", label: "Home", short: "Home", Icon: HomeIcon },
  { href: "/identify", label: "Identify", short: "Identify", Icon: CameraIcon },
  { href: "/collection", label: "Watches", short: "Watches", Icon: GridIcon },
  // Desktop-only: the bottom tab bar stays at 5; mobile reaches Timeline via
  // the Collection page header.
  { href: "/timeline", label: "Timeline", short: "Time", Icon: ClockIcon, desktopOnly: true },
  { href: "/portfolio", label: "Value", short: "Value", Icon: ChartIcon },
  { href: "/vet", label: "Vet a purchase", short: "Vet", Icon: ShieldIcon },
  { href: "/settings", label: "Settings", short: "Settings", Icon: GearIcon },
];

// Bottom tab bar shows the 5 most-used destinations; Settings lives in the top bar.
const TABS = LINKS.filter((l) => l.href !== "/settings" && !("desktopOnly" in l));

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // A watch page, the timeline, and manual add all belong to the Watches tab —
  // otherwise no tab was highlighted there.
  const tabActive = (href: string) =>
    href === "/collection"
      ? ["/collection", "/watch/", "/timeline", "/add", "/duplicates"].some((prefix) => pathname.startsWith(prefix))
      : isActive(href);

  return (
    <>
      {/* Top bar */}
      {/* viewportFit is "cover" and the PWA runs standalone, so on a notched
          iPhone the layout extends under the status bar. Pad the bar by the
          top inset — the blurred background then sits behind the clock rather
          than the wordmark colliding with it. */}
      {/* On phones the header scrolls away (the bottom tab bar is the
          navigation) — fixed chrome took ~27% of an iPhone screen. This strip
          keeps the status-bar area opaque while content scrolls under it. */}
      <div
        aria-hidden
        className="no-print lg:hidden fixed inset-x-0 top-0 z-40 bg-base/95 backdrop-blur"
        style={{ height: "env(safe-area-inset-top, 0px)" }}
      />
      <header
        className="relative lg:sticky lg:top-0 z-30 border-b border-line/70 backdrop-blur bg-base/70"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 md:min-h-20 md:px-5 md:py-3 flex items-center justify-between gap-2 md:gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            {/* Concept C, the everyday app-open: one 400ms escapement tick.
                AppShell persists across client-side navigation, so this fires
                once per full page load — NOT per route change (intended, A6). */}
            <Logo size={30} tick />
            <span className="font-serif text-xl md:text-2xl tracking-wide">Caliber</span>
          </Link>

          {/* Desktop: full nav */}
          <div className="hidden lg:flex items-center gap-2">
            <nav aria-label="Main" className="flex items-center gap-1">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={`px-3.5 py-2.5 rounded-lg text-[1.0625rem] font-medium transition-colors ${
                    isActive(l.href) ? "text-accent bg-surface-2" : "text-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <form action="/api/auth/logout" method="post" className="border-l border-line pl-2">
              <button type="submit" className="btn btn-ghost btn-sm">
                Sign out
              </button>
            </form>
          </div>

          {/* Mobile: Settings (main nav is the bottom bar). Sign out lives in
              Settings — a one-tap icon next to the gear signed people out by
              accident, and signing back in is the slowest thing in the app. */}
          <div className="lg:hidden flex items-center">
            <Link
              href="/settings"
              aria-current={isActive("/settings") ? "page" : undefined}
              className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[0.95rem] font-medium ${
                isActive("/settings") ? "text-accent bg-surface-2" : "text-muted"
              }`}
            >
              <GearIcon className="w-6 h-6" />
              Settings
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar (no-print: paper is for the appraisal, not chrome) */}
      <nav
        aria-label="Tabs"
        className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line/70 bg-base/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = tabActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 min-h-[3.75rem] flex-col items-center justify-center gap-1 px-0.5 py-1.5"
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                <t.Icon className="w-6 h-6" />
                <span className="text-[0.9375rem] font-semibold leading-tight">{t.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
