import { NextRequest } from "next/server";
import { clientIp } from "./clientIp";

// Two layers (AUTH-3):
//
// 1. Per client: 5 failures in 15 minutes locks that client out for the rest
//    of the window. The client is identified by lib/clientIp (X-Real-IP on
//    Railway, else the right-most X-Forwarded-For hop) — never the left-most
//    X-Forwarded-For value, which the client controls.
// 2. Global, trusting no header: once 20 logins have failed in 15 minutes
//    across ALL clients, only one login attempt per 5 seconds is admitted
//    until the failures age out. This slows a distributed or header-rotating
//    guesser to ~180 guesses per 15 minutes; once a burst stops, the owner gets
//    an attempt through within 5 seconds, and a successful login is never
//    blocked by its own success.
//
// RV-NJS-6: an attempt is RESERVED — counted as a failure, per client and
// globally — synchronously in admitLoginAttempt, in the same tick as the
// check and before the password is verified (any `await`). A parallel burst
// therefore cannot all pass the check before the first failure is recorded.
// The route then settles the reservation: loginSucceeded (clears the
// client and withdraws the pending global failure), loginFailed (the
// reservation stands as the failure), or releaseLoginReservation (the check
// itself errored, e.g. the database was unavailable — not a wrong password).
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;
const GLOBAL_FAILURE_THRESHOLD = 20;
const GLOBAL_SPACING_MS = 5_000;
const MAX_TRACKED_FAILURES = 10_000;

const failures = new Map<string, { count: number; resetAt: number }>();
let globalFailures: number[] = [];
let lastThrottledAttemptAt = Number.NEGATIVE_INFINITY;
let throttleLoggedAt = Number.NEGATIVE_INFINITY;

function currentFailureFor(id: string, now: number) {
  const current = failures.get(id);
  if (current && current.resetAt <= now) {
    failures.delete(id);
    return undefined;
  }
  return current;
}

function recentGlobalFailures(now: number): number {
  globalFailures = globalFailures.filter((at) => at > now - WINDOW_MS);
  return globalFailures.length;
}

function clientRetryAfterFor(id: string, now: number): number {
  const current = currentFailureFor(id, now);
  if (!current || current.count < MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
}

function globalRetryAfter(now: number): number {
  if (recentGlobalFailures(now) < GLOBAL_FAILURE_THRESHOLD) return 0;
  const wait = lastThrottledAttemptAt + GLOBAL_SPACING_MS - now;
  return wait > 0 ? Math.ceil(wait / 1_000) : 0;
}

// Count one failure for `id` and globally. Returns the global timestamp used.
function countFailure(id: string, now: number): number {
  if (failures.size > 5_000) {
    for (const [key, value] of failures) if (value.resetAt <= now) failures.delete(key);
  }
  const current = currentFailureFor(id, now);
  if (!current) {
    failures.set(id, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    current.count += 1;
  }
  globalFailures.push(now);
  if (globalFailures.length > MAX_TRACKED_FAILURES) globalFailures = globalFailures.slice(-MAX_TRACKED_FAILURES);
  return now;
}

function withdrawGlobal(at: number): void {
  const index = globalFailures.lastIndexOf(at);
  if (index !== -1) globalFailures.splice(index, 1);
}

// Seconds this request must wait before a login attempt is allowed (0 = now).
// Read-only: use admitLoginAttempt to actually take an attempt.
export function loginRetryAfter(req: NextRequest, now = Date.now()): number {
  return clientRetryAfterFor(clientIp(req), now) || globalRetryAfter(now);
}

export type LoginReservation = { id: string; at: number; settled: boolean };

export type LoginAdmission = {
  // Seconds to wait before trying again; 0 = the attempt may proceed.
  retryAfter: number;
  // Which limit refused it: this client's lockout, or the site-wide throttle.
  scope: "client" | "global" | null;
  // Present when admitted: the attempt is already counted as a failure until
  // it is settled with loginSucceeded / loginFailed / releaseLoginReservation.
  reservation: LoginReservation | null;
};

// Take a login attempt. Everything here is synchronous, so the check and the
// reservation happen in one tick. When it may proceed and the global throttle
// is active, it also claims the next 5-second slot. A locked-out client is
// turned away before it can use up a global slot.
export function admitLoginAttempt(req: NextRequest, now = Date.now()): LoginAdmission {
  const id = clientIp(req);
  const clientWait = clientRetryAfterFor(id, now);
  if (clientWait > 0) return { retryAfter: clientWait, scope: "client", reservation: null };
  const recent = recentGlobalFailures(now);
  if (recent >= GLOBAL_FAILURE_THRESHOLD) {
    const globalWait = globalRetryAfter(now);
    if (globalWait > 0) return { retryAfter: globalWait, scope: "global", reservation: null };
    lastThrottledAttemptAt = now;
    if (now - throttleLoggedAt >= 60_000) {
      throttleLoggedAt = now;
      // Counts only: no usernames, passwords or addresses in the log.
      console.warn(
        `[login] Global login throttle active: ${recent} failed logins in the last 15 minutes; allowing one attempt every ${GLOBAL_SPACING_MS / 1_000} s.`
      );
    }
  }
  return { retryAfter: 0, scope: null, reservation: { id, at: countFailure(id, now), settled: false } };
}

// Correct password: clear this client's failures and withdraw the pending
// global failure, so a successful login never counts against anyone.
export function loginSucceeded(reservation: LoginReservation): void {
  if (reservation.settled) return;
  reservation.settled = true;
  failures.delete(reservation.id);
  withdrawGlobal(reservation.at);
}

// Wrong password: the reservation stands as the failure. Returns this
// client's lockout wait (0 when it is not locked out yet).
export function loginFailed(reservation: LoginReservation, now = Date.now()): number {
  reservation.settled = true;
  return clientRetryAfterFor(reservation.id, now);
}

// The check itself failed (an exception, not a wrong password): undo the
// reservation so an outage does not lock the owner out.
export function releaseLoginReservation(reservation: LoginReservation): void {
  if (reservation.settled) return;
  reservation.settled = true;
  const current = failures.get(reservation.id);
  if (current) {
    current.count -= 1;
    if (current.count <= 0) failures.delete(reservation.id);
  }
  withdrawGlobal(reservation.at);
}

// Record a failure without a reservation (tests and simulations).
export function recordLoginFailure(req: NextRequest, now = Date.now()): number {
  const id = clientIp(req);
  countFailure(id, now);
  return clientRetryAfterFor(id, now);
}

export function clearLoginFailures(req: NextRequest): void {
  failures.delete(clientIp(req));
}

export function resetLoginRateLimitsForTests(): void {
  failures.clear();
  globalFailures = [];
  lastThrottledAttemptAt = Number.NEGATIVE_INFINITY;
  throttleLoggedAt = Number.NEGATIVE_INFINITY;
}
