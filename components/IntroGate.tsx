"use client";

import { useEffect, useState } from "react";
import Intro from "./Intro";
import WelcomeModal from "./WelcomeModal";

const ONBOARD_KEY = "caliber_onboarded_v1";
const INTRO_SEEN_KEY = "caliber_intro_seen_v1";

// Launch orchestrator (client-only, post-hydration — never blocks first paint
// of the page underneath):
//   • motion allowed → the cold open plays once per app launch (browser
//     session), then, if onboarding is unfinished, resolves straight into
//     WelcomeModal step one as one continuous overlay.
//   • reduced motion → no film at all: static entry into the modal or the app.
//
// "Once per launch" is a sessionStorage flag: opening the app (or a cold
// start of the home-screen app) plays it; a refresh, the sign-in redirect,
// or reopening a page in the same session does not. It used to replay on
// every full page load, which meant ~18s of film around every sign-in.
// Print and appraisal pages never show it — it would cover what is printed.
// `withOnboarding` is false on the signed-out login screen: the film still
// plays there, but the welcome flow does not — it talks about identifying
// your first watch, which makes no sense before you are signed in.

function filmAlreadyPlayed(): boolean {
  try {
    if (window.sessionStorage.getItem(INTRO_SEEN_KEY)) return true;
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* storage unavailable — play it, as before */
  }
  return false;
}

function printingPage(): boolean {
  const { pathname, search } = window.location;
  return pathname.startsWith("/appraisal") || new URLSearchParams(search).has("print");
}
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
      const printing = printingPage();
      const wantsModal = withOnboarding && !onboardedFlag && !printing;
      setOnboarded(!wantsModal);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || printing || filmAlreadyPlayed()) {
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
