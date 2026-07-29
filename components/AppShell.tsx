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
      <main className="flex-1 w-full min-w-0 max-w-6xl mx-auto px-4 py-5 sm:px-5 sm:py-6 md:py-8">
        {children}
      </main>
      <footer className="border-t border-line/60 mt-10 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 py-6 text-base leading-relaxed text-muted flex flex-wrap gap-3 justify-between sm:px-5">
          <span>Caliber · Watch intelligence for collectors</span>
          <span>Estimates are guidance, not appraisals. Verify high-value pieces in person.</span>
        </div>
      </footer>
    </>
  );
}
