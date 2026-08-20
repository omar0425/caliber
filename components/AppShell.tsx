"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";
import IntroGate from "./IntroGate";
import SpendWarning from "./SpendWarning";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The cold open plays on every app launch, the login screen included —
  // it is the way into Caliber, not a reward for signing in.
  if (pathname === "/login") {
    return (
      <>
        <IntroGate withOnboarding={false} />
        {children}
      </>
    );
  }

  return (
    <>
      <IntroGate />
      <Nav />
      <SpendWarning />
      <main className="flex-1 w-full min-w-0 max-w-6xl mx-auto px-4 py-5 sm:px-5 sm:py-6 md:py-8">
        {children}
      </main>
      <footer className="border-t border-line/60 mt-10 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 py-6 leading-relaxed text-muted flex flex-wrap gap-3 justify-between sm:px-5">
          <span>Caliber · Watch intelligence for collectors</span>
          <span>Estimates are guidance, not appraisals. Verify high-value pieces in person.</span>
        </div>
      </footer>
    </>
  );
}
