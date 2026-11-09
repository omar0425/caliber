"use client";

import { useEffect, useState } from "react";

const FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

// Today's date in the viewer's own timezone. A server-rendered date uses the
// server clock (UTC on Railway), which already reads "tomorrow" on a US
// evening — wrong on an appraisal printed for insurance.
export default function LocalDate() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setText(new Date().toLocaleDateString("en-US", FORMAT)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <span suppressHydrationWarning>{text ?? " "}</span>;
}
