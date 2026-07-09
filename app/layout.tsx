import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import WelcomeModal from "@/components/WelcomeModal";
import SpendWarning from "@/components/SpendWarning";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Caliber — Watch Intelligence",
  description:
    "Identify, catalog, and authenticate watches. Snap a photo, get the specs, spot the fakes.",
  appleWebApp: { capable: true, title: "Caliber", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
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
      </body>
    </html>
  );
}
