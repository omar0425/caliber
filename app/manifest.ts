import type { MetadataRoute } from "next";

// Makes Caliber installable as a home-screen app (PWA): standalone window,
// dark theme, proper icons. No service worker — the app is server-backed and
// small enough that offline caching isn't worth the staleness risk.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caliber — Watch Intelligence",
    short_name: "Caliber",
    description:
      "Identify, catalog, and authenticate watches. Snap a photo, get the specs, spot the fakes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0e",
    theme_color: "#0b0b0e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
