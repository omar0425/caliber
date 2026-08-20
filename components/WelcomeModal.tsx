"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "./Logo";

const KEY = "caliber_onboarded_v1";

type Step = {
  title: string;
  body: React.ReactNode;
};

// Onboarding wizard. On a fresh install this is where the cold open lands:
// the Intro film's dial resolves directly into step one (see IntroGate), so
// step one's header keeps the dial/wordmark framing rather than re-introducing
// it. All motion is CSS and is disabled globally under prefers-reduced-motion.
export default function WelcomeModal({ onFinish }: { onFinish: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  function finish() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    onFinish();
  }

  const steps: Step[] = [
    {
      title: "Welcome to Caliber",
      body: (
        <>
          <div className="flex justify-center my-4">
            {/* The dial the intro resolved into — static from here on */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full border border-accent/50">
              <div className="absolute inset-2 rounded-full border border-line/70" />
              <Logo size={56} />
            </div>
          </div>
          <p className="text-lg text-muted">
            Your personal watch expert. Caliber helps you understand, catalog, and protect your
            collection — one photo at a time.
          </p>
        </>
      ),
    },
    {
      title: "Four things it does",
      body: (
        <ul className="space-y-4 text-left mt-2">
          {[
            ["Identify", "Take a photo of any watch and get its full specs, history, and value."],
            ["Collect", "Keep your whole collection in one place, with photos and documents."],
            ["Vet a buy", "Thinking of buying one? Caliber checks it for fakes and fair price."],
            ["Ask", "Chat about any watch — how rare it is, limited editions, and more."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span className="text-accent text-xl leading-none mt-1">◆</span>
              <span>
                <span className="font-semibold text-ink">{t}. </span>
                <span className="text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      title: "Turn on the smart features",
      body: (
        <>
          <p className="text-lg text-muted">
            Caliber uses AI to recognize watches. You&apos;ll add a simple key once (we&apos;ll show
            you exactly how). Until then, AI analysis stays paused while you can still look around
            the collection features.
          </p>
          <p className="text-base text-muted mt-3">
            One thing to remember: the AI is smart but not perfect — it can make mistakes, so
            double-check anything important before you buy or insure.
          </p>
        </>
      ),
    },
    {
      title: "You're all set",
      body: (
        <p className="text-lg text-muted">
          Ready to begin? Add your first watch by taking or uploading a photo. It only takes a
          moment.
        </p>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  return (
    <div className="modal-enter fixed inset-0 z-[60] flex items-center justify-center p-2 min-[400px]:p-4 bg-black/70 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Welcome to Caliber — step ${step + 1} of ${steps.length}`}
        className="card shadow-overlay w-full max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-5 min-[400px]:p-7 sm:p-10 text-center relative"
      >
        <button
          onClick={finish}
          className="absolute top-3 right-3 min-h-11 px-2 text-muted hover:text-ink text-base"
          aria-label="Skip introduction"
        >
          Skip
        </button>

        <p className="label mb-2 pr-12">
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="font-serif text-[1.75rem] min-[400px]:text-3xl leading-tight mb-4">{current.title}</h2>
        <div>{current.body}</div>

        {/* Progress: a small dial whose hand advances one hour per step */}
        <div className="flex justify-center my-6" aria-hidden="true">
          <svg viewBox="0 0 40 40" className="w-9 h-9">
            <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-line)" strokeWidth="2" />
            {Array.from({ length: 4 }).map((_, i) => {
              const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
              return (
                <line
                  key={i}
                  x1={20 + Math.cos(a) * 13.5}
                  y1={20 + Math.sin(a) * 13.5}
                  x2={20 + Math.cos(a) * 16}
                  y2={20 + Math.sin(a) * 16}
                  stroke={i <= step ? "var(--color-accent)" : "var(--color-line)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{ transition: "stroke var(--duration-base) var(--ease-standard)" }}
                />
              );
            })}
            <line
              x1="20"
              y1="20"
              x2="20"
              y2="7.5"
              stroke="var(--color-accent-soft)"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{
                transform: `rotate(${step * 90}deg)`,
                transformOrigin: "20px 20px",
                transition: "transform var(--duration-slow) var(--ease-emphasized)",
              }}
            />
            <circle cx="20" cy="20" r="2" fill="var(--color-accent-soft)" />
          </svg>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          {step === 0 ? (
            <span className="hidden sm:block" aria-hidden="true" />
          ) : (
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="btn btn-ghost w-full sm:w-auto"
            >
              Back
            </button>
          )}

          {!isLast ? (
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
              {step === 2 && (
                <button
                  onClick={() => {
                    finish();
                    router.push("/settings");
                  }}
                  className="btn btn-ghost w-full sm:w-auto"
                >
                  Add key now
                </button>
              )}
              <button onClick={() => setStep((s) => s + 1)} className="btn btn-gold w-full sm:w-auto">
                Next
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                finish();
                router.push("/identify");
              }}
              className="btn btn-gold w-full sm:w-auto"
            >
              Identify my first watch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
