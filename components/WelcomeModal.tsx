"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "./Logo";

const KEY = "caliber_onboarded_v1";

type Step = {
  title: string;
  body: React.ReactNode;
};

export default function WelcomeModal() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setMounted(true);
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function finish() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!mounted || !open) return null;

  const steps: Step[] = [
    {
      title: "Welcome to Caliber",
      body: (
        <>
          <div className="flex justify-center my-4">
            <Logo size={72} />
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
            you exactly how). Until then, it runs in a free <strong className="text-ink">demo mode</strong> so
            you can look around.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-8 sm:p-10 text-center relative">
        <button
          onClick={finish}
          className="absolute top-4 right-5 text-muted hover:text-ink text-sm"
          aria-label="Skip introduction"
        >
          Skip
        </button>

        <p className="label mb-2">
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="font-serif text-3xl mb-4">{current.title}</h2>
        <div className="min-h-40">{current.body}</div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 my-6">
          {steps.map((_, i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full transition-colors"
              style={{ background: i === step ? "var(--color-accent)" : "var(--color-line)" }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={`btn btn-ghost ${step === 0 ? "invisible" : ""}`}
          >
            Back
          </button>

          {!isLast ? (
            <div className="flex gap-2">
              {step === 2 && (
                <button
                  onClick={() => {
                    finish();
                    router.push("/settings");
                  }}
                  className="btn btn-ghost"
                >
                  Add key now
                </button>
              )}
              <button onClick={() => setStep((s) => s + 1)} className="btn btn-gold">
                Next
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                finish();
                router.push("/identify");
              }}
              className="btn btn-gold"
            >
              Identify my first watch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
