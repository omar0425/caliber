"use client";

import { useEffect, useState } from "react";
import Intro from "./Intro";
import WelcomeModal from "./WelcomeModal";

const ONBOARD_KEY = "caliber_onboarded_v1";

// Launch orchestrator (client-only, post-hydration — never blocks first paint
// of the page underneath):
//   • motion allowed → the cold open plays on EVERY app launch, then, if
//     onboarding is unfinished, resolves straight into WelcomeModal step one
//     as one continuous overlay.
//   • reduced motion → no film at all: static entry into the modal or the app.
//
// The film is deliberately NOT gated on storage: it is the way into Caliber,
// not a first-run tutorial. Because this component mounts once in AppShell and
// AppShell survives client-side navigation, "every launch" means every full
// page load — moving between pages inside the app never replays it.
// To make it once-per-install again, gate the setPhase("intro") below on a
// localStorage flag.
// `withOnboarding` is false on the signed-out login screen: the film still
// plays there, but the welcome flow does not — it talks about identifying
// your first watch, which makes no sense before you are signed in.
export default function IntroGate({ withOnboarding = true }: { withOnboarding?: boolean }) {
  const [phase, setPhase] = useState<"boot" | "intro" | "modal" | "done">("boot");
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let onboardedFlag = true;
      try {
        onboardedFlag = Boolean(localStorage.getItem(ONBOARD_KEY));
      } catch {
        /* storage unavailable — treat onboarding as done, never trap the user */
      }
      const wantsModal = withOnboarding && !onboardedFlag;
      setOnboarded(!wantsModal);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setPhase(wantsModal ? "modal" : "done");
      } else {
        setPhase("intro");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [withOnboarding]);

  function introDone() {
    setPhase(onboarded ? "done" : "modal");
  }

  if (phase === "intro") return <Intro onDone={introDone} />;
  if (phase === "modal") return <WelcomeModal onFinish={() => setPhase("done")} />;
  return null;
}
