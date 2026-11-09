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
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050506",
    theme_color: "#050506",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon (Android; some iOS versions) to jump
    // straight into the common tasks.
    shortcuts: [
      { name: "Identify a watch", short_name: "Identify", url: "/identify", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Vet a purchase", short_name: "Vet", url: "/vet", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Add a watch manually", short_name: "Add", url: "/add", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
