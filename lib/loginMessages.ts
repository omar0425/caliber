// Messages for /login?error=… (S-2). The site-wide throttle ("busy") only ever
// asks for a few seconds, so it must not tell the owner to wait 15 minutes —
// that is reserved for this device's own lockout ("rate").
export function loginErrorMessage(error: string | undefined, retry: string | undefined): string | null {
  if (error === "busy") {
    const seconds = /^\d{1,2}$/.test(retry ?? "") ? Number(retry) : 0;
    const wait = seconds >= 1 && seconds <= 60 ? `${seconds} second${seconds === 1 ? "" : "s"}` : "a few seconds";
    return `Too many sign-in attempts on this site right now. Wait ${wait} and try again.`;
  }
  if (error === "rate") return "Too many unsuccessful attempts. Wait 15 minutes, then try again.";
  if (error === "invalid") return "That username or password didn’t match.";
  if (error === "logout") return "Sign-out could not be verified. Please try again.";
  return null;
}
