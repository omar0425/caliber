"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";
import WelcomeModal from "./WelcomeModal";
import SpendWarning from "./SpendWarning";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") return <>{children}</>;

  return (
    <>
      <WelcomeModal />
      <Nav />
      <SpendWarning />
      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-6 md:py-8">{children}</main>
      <footer className="border-t border-line/60 mt-10 pb-24 md:pb-0">
        <div className="max-w-6xl mx-auto px-5 py-6 text-xs text-muted flex flex-wrap gap-2 justify-between">
          <span>Caliber · Watch intelligence for collectors</span>
          <span>Estimates are guidance, not appraisals. Verify high-value pieces in person.</span>
        </div>
      </footer>
    </>
  );
}
