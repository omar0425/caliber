"use client";

import { useEffect } from "react";

// When a watch page is opened with ?print=1 (e.g. from a collection card's
// print button), wait for the page — including the photo — to finish loading,
// then open the print dialog automatically.
export default function AutoPrint() {
  useEffect(() => {
    let fired = false;
    const trigger = () => {
      if (fired) return;
      fired = true;
      // Small delay so images have a beat to paint before the dialog snapshots.
      window.setTimeout(() => window.print(), 350);
    };
    if (document.readyState === "complete") trigger();
    else window.addEventListener("load", trigger, { once: true });
    return () => window.removeEventListener("load", trigger);
  }, []);
  return null;
}
