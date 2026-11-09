"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Full-size photo inside the app (no new window — in the installed iPhone app a
// new window lost the sign-in and had no way back).
export default function PhotoViewer({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Portaled to <body> so no card's blur/transform can trap the fixed overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 [overscroll-behavior:contain]"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
      <button
        ref={closeRef}
        onClick={onClose}
        className="btn btn-ghost absolute right-3 top-3 min-h-11"
        style={{ top: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        Close
      </button>
    </div>,
    document.body
  );
}
