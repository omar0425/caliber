"use client";

import { useState } from "react";

// Long AI paragraphs (summary, history) filled most of a phone screen each.
// Show the first few lines with a "Read more" toggle; short text renders as-is.
// Printing always shows the full text.
export default function ExpandableText({
  text,
  className = "",
  threshold = 320,
}: {
  text: string;
  className?: string;
  threshold?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > threshold;

  return (
    <div className="min-w-0">
      <p
        className={`break-words leading-relaxed [overflow-wrap:anywhere] ${className} ${
          long && !open ? "line-clamp-5 print:line-clamp-none" : ""
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="no-print mt-1 min-h-11 font-medium text-accent hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
