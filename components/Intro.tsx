"use client";

import { useEffect, useRef, useState } from "react";

// Concept A — "The Caliber Winds Up". First-launch cold open: an escapement
// wheel catches gold light and beats, the camera pulls back through the gear
// train, the movement resolves into a dial, the hands sweep backwards and
// settle on the real current time, and CALIBER sets where a maker's name sits.
// Then the coda: the dial pumps twice like a heartbeat (the text never moves)
// and the frame holds still long enough to actually read the ending before
// the overlay fades into the app.
//
// Pure CSS + inline SVG: zero network calls, zero AI calls, no dependencies.
// ~8.2s, skippable at any frame (Skip button is focusable on frame one, Esc
// also works). Never rendered at all under prefers-reduced-motion — the gate
// upstream guarantees that; the stylesheet's reduced-motion clamp is the
// second line of defense.
//
// Keep this in step with the .intro-* keyframe delays in globals.css: the
// stylesheet drives the picture, this only decides when the overlay leaves.

const FILM_MS = 8200;

export default function Intro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    // Brief cross-fade out, then hand off to the welcome modal.
    window.setTimeout(onDone, 300);
  };

  useEffect(() => {
    const timer = window.setTimeout(finish, FILM_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hands settle on the real current time.
  const now = new Date();
  const minuteAngle = (now.getMinutes() / 60) * 360;
  const hourAngle = ((now.getHours() % 12) / 12) * 360 + minuteAngle / 12;

  return (
    <div
      role="dialog"
      aria-label="Caliber — every watch is a time machine"
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-base transition-opacity duration-300 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <svg
        viewBox="0 0 320 320"
        className="w-[min(78vw,340px)] h-auto intro-scene"
        aria-hidden
      >
        <defs>
          <radialGradient id="intro-glow" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="160" cy="150" r="140" fill="url(#intro-glow)" className="intro-glow" />

        {/* Escapement wheel — the beat */}
        <g className="intro-escapement" style={{ transformOrigin: "160px 150px" }}>
          {Array.from({ length: 15 }).map((_, i) => {
            const a = (i / 15) * Math.PI * 2;
            const x1 = 160 + Math.cos(a) * 34;
            const y1 = 150 + Math.sin(a) * 34;
            const x2 = 160 + Math.cos(a + 0.12) * 46;
            const y2 = 150 + Math.sin(a + 0.12) * 46;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
            );
          })}
          <circle cx="160" cy="150" r="34" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
          <circle cx="160" cy="150" r="4" fill="var(--color-accent-soft)" />
        </g>

        {/* Gear train — pulls back into place */}
        <g className="intro-gears" style={{ transformOrigin: "160px 150px" }}>
          <circle cx="160" cy="150" r="62" fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
          <circle cx="160" cy="150" r="86" fill="none" stroke="var(--color-line)" strokeWidth="1.5" strokeDasharray="3 6" />
          <circle cx="160" cy="150" r="110" fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
        </g>

        {/* Dial — resolves over the movement */}
        <g className="intro-dial" style={{ transformOrigin: "160px 150px" }}>
          <circle cx="160" cy="150" r="118" fill="var(--color-base)" stroke="var(--color-accent)" strokeWidth="2.5" opacity="0.97" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const inner = i % 3 === 0 ? 96 : 104;
            return (
              <line key={i}
                x1={160 + Math.cos(a) * inner} y1={150 + Math.sin(a) * inner}
                x2={160 + Math.cos(a) * 110} y2={150 + Math.sin(a) * 110}
                stroke={i % 3 === 0 ? "var(--color-accent-soft)" : "var(--color-accent)"}
                strokeWidth={i % 3 === 0 ? 3 : 1.5} strokeLinecap="round" />
            );
          })}
          {/* Hands: sweep backwards through time, then settle on now */}
          <g className="intro-hand-hour" style={{ transformOrigin: "160px 150px" }}>
            <line x1="160" y1="150" x2="160" y2="102" stroke="var(--color-accent-soft)" strokeWidth="4.5" strokeLinecap="round"
              style={{ transform: `rotate(${hourAngle}deg)`, transformOrigin: "160px 150px" }} />
          </g>
          <g className="intro-hand-minute" style={{ transformOrigin: "160px 150px" }}>
            <line x1="160" y1="150" x2="160" y2="66" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round"
              style={{ transform: `rotate(${minuteAngle}deg)`, transformOrigin: "160px 150px" }} />
          </g>
          <circle cx="160" cy="150" r="5" fill="var(--color-accent-soft)" />
        </g>
      </svg>

      <p className="intro-wordmark absolute inset-x-0 text-center font-serif text-4xl tracking-[0.35em] text-accent-soft"
        style={{ top: "calc(50% + 118px)" }}>
        CALIBER
      </p>
      <p className="intro-tagline absolute inset-x-0 text-center text-muted"
        style={{ top: "calc(50% + 168px)" }}>
        Every watch is a time machine.
      </p>

      <button
        onClick={finish}
        autoFocus
        className="btn btn-ghost btn-sm absolute"
        style={{
          right: "max(1rem, env(safe-area-inset-right, 0px))",
          bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        Skip
      </button>
    </div>
  );
}
