import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "./loginMessages";

describe("login page messages (S-2)", () => {
  it("tells the user to wait seconds, not minutes, when the site-wide throttle is on", () => {
    expect(loginErrorMessage("busy", "4")).toBe(
      "Too many sign-in attempts on this site right now. Wait 4 seconds and try again."
    );
    expect(loginErrorMessage("busy", "1")).toBe(
      "Too many sign-in attempts on this site right now. Wait 1 second and try again."
    );
    for (const retry of [undefined, "", "0", "abc", "999", "-3"]) {
      expect(loginErrorMessage("busy", retry)).toBe(
        "Too many sign-in attempts on this site right now. Wait a few seconds and try again."
      );
    }
  });

  it("keeps the existing messages", () => {
    expect(loginErrorMessage("rate", undefined)).toBe("Too many unsuccessful attempts. Wait 15 minutes, then try again.");
    expect(loginErrorMessage("invalid", undefined)).toBe("That username or password didn’t match.");
    expect(loginErrorMessage("logout", undefined)).toBe("Sign-out could not be verified. Please try again.");
    expect(loginErrorMessage(undefined, undefined)).toBeNull();
    expect(loginErrorMessage("anything-else", "4")).toBeNull();
  });
});
