"use client";

// `subtle` is for pages where printing is occasional (a single watch): a
// small secondary button instead of the screen's loudest call to action.
export default function PrintButton({ variant = "primary" }: { variant?: "primary" | "subtle" }) {
  return (
    <button
      onClick={() => window.print()}
      className={
        variant === "subtle"
          ? "btn btn-ghost no-print min-h-11 px-4"
          : "btn btn-gold no-print w-full sm:w-auto"
      }
    >
      {variant === "subtle" ? "Print / PDF" : "Print / Save as PDF"}
    </button>
  );
}
