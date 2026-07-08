"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/identify", label: "Identify" },
  { href: "/collection", label: "Collection" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/vet", label: "Vet a Buy" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 backdrop-blur bg-base/70">
      <div className="max-w-6xl mx-auto px-5 min-h-20 py-3 flex items-center justify-between gap-4 flex-wrap">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="font-serif text-2xl tracking-wide">
            Caliber
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3.5 py-2.5 rounded-lg text-base font-medium transition-colors ${
                isActive(l.href)
                  ? "text-accent bg-surface-2"
                  : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
