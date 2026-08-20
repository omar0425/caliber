import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Bodoni_Moda } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

// Lume type system: a high-contrast didone for display, a technical
// grotesk for text, and a mono that carries every number and label.
const grotesk = Archivo({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const monoTech = IBM_Plex_Mono({
  variable: "--font-mono-tech",
  subsets: ["latin"],
  weight: ["400", "500"],
});
const bodoni = Bodoni_Moda({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Caliber — Watch Intelligence",
  description:
    "Identify, catalog, and authenticate watches. Snap a photo, get the specs, spot the fakes.",
  appleWebApp: { capable: true, title: "Caliber", statusBarStyle: "black-translucent" },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#050506",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${grotesk.variable} ${monoTech.variable} ${bodoni.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
