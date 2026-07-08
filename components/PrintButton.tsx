"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn btn-gold no-print">
      Print / Save as PDF
    </button>
  );
}
