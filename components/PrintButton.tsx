"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn btn-gold no-print w-full sm:w-auto">
      Print / Save as PDF
    </button>
  );
}
