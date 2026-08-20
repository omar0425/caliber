"use client";

import { useEffect, useState } from "react";
import Intro from "./Intro";
import WelcomeModal from "./WelcomeModal";

const INTRO_KEY = "caliber_intro_seen_v1";
const ONBOARD_KEY = "caliber_onboarded_v1";

// First-launch orchestrator (client-only, post-hydration — never blocks first
// paint of the page underneath):
//   • intro not seen, motion allowed → Concept A film, then (if not onboarded)
//     resolve straight into WelcomeModal step one. One continuous overlay.
//   • intro not seen, reduced motion → no film at all: static entry into the
//     modal (or the app), intro marked seen immediately.
//   • intro seen → no film ever again; modal only if onboarding is unfinished.
export default function IntroGate() {
  const [phase, setPhase] = useState<"boot" | "intro" | "modal" | "done">("boot");
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let introSeen = false;
      let onboardedFlag = true;
      try {
        introSeen = Boolean(localStorage.getItem(INTRO_KEY));
        onboardedFlag = Boolean(localStorage.getItem(ONBOARD_KEY));
      } catch {
        /* storage unavailable — treat as seen, never trap the user */
        introSeen = true;
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setOnboarded(onboardedFlag);
      if (!introSeen && reduced) {
        try {
          localStorage.setItem(INTRO_KEY, "1");
        } catch {
          /* ignore */
        }
        setPhase(onboardedFlag ? "done" : "modal");
      } else if (!introSeen) {
        setPhase("intro");
      } else {
        setPhase(onboardedFlag ? "done" : "modal");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function introDone() {
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase(onboarded ? "done" : "modal");
  }

  if (phase === "intro") return <Intro onDone={introDone} />;
  if (phase === "modal") return <WelcomeModal onFinish={() => setPhase("done")} />;
  return null;
}
