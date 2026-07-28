"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { HomeIcon, CameraIcon, GridIcon, ChartIcon, ShieldIcon, GearIcon } from "./NavIcons";

const LINKS = [
  { href: "/", label: "Dashboard", short: "Home", Icon: HomeIcon },
  { href: "/identify", label: "Identify", short: "Identify", Icon: CameraIcon },
  { href: "/collection", label: "Collection", short: "Watches", Icon: GridIcon },
  { href: "/portfolio", label: "Portfolio", short: "Value", Icon: ChartIcon },
  { href: "/vet", label: "Vet a Buy", short: "Vet", Icon: ShieldIcon },
  { href: "/settings", label: "Settings", short: "Settings", Icon: GearIcon },
];

// Bottom tab bar shows the 5 most-used destinations; Settings lives in the top bar.
const TABS = LINKS.filter((l) => l.href !== "/settings");

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line/70 backdrop-blur bg-base/70">
        <div className="max-w-6xl mx-auto px-5 h-16 md:min-h-20 md:py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="font-serif text-xl md:text-2xl tracking-wide">Caliber</span>
          </Link>

          {/* Desktop: full nav */}
          <div className="hidden md:flex items-center gap-2">
            <nav className="flex items-center gap-1">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3.5 py-2.5 rounded-lg text-base font-medium transition-colors ${
                    isActive(l.href) ? "text-accent bg-surface-2" : "text-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <form action="/api/auth/logout" method="post" className="border-l border-line pl-2">
              <button type="submit" className="btn btn-ghost min-h-0! px-3! py-2.5! text-sm">
                Sign out
              </button>
            </form>
          </div>

          {/* Mobile: settings plus sign out (main nav is the bottom bar) */}
          <div className="md:hidden flex items-center gap-1">
            <Link
              href="/settings"
              aria-label="Settings"
              className={`p-2.5 rounded-lg ${
                isActive("/settings") ? "text-accent bg-surface-2" : "text-muted"
              }`}
            >
              <GearIcon className="w-6 h-6" />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                className="p-2.5 rounded-lg text-muted hover:text-ink"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" aria-hidden>
                  <path
                    d="M10 5H6.5A2.5 2.5 0 004 7.5v9A2.5 2.5 0 006.5 19H10M14 8l4 4-4 4M8 12h10"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line/70 bg-base/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className="flex flex-col items-center justify-center gap-1 py-2.5 min-h-16"
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                <t.Icon className="w-6 h-6" />
                <span className="text-[11px] font-medium leading-none">{t.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
