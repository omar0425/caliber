import type { Metadata } from "next";
import Logo from "@/components/Logo";
import { sanitizeReturnTo } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in — Caliber",
  description: "Sign in to your private Caliber watch collection.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params.next);
  const error =
    params.error === "rate"
      ? "Too many unsuccessful attempts. Wait 15 minutes, then try again."
      : params.error === "invalid"
        ? "That username or password didn’t match."
        : null;

  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] bg-base">
      <section className="relative hidden lg:flex min-w-0 overflow-hidden border-r border-line/70 p-12 xl:p-14 2xl:p-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_28%,rgba(200,164,92,0.16),transparent_32%),radial-gradient(circle_at_72%_72%,rgba(230,207,154,0.08),transparent_35%)]" />
        <div className="absolute -left-52 top-1/2 -translate-y-1/2 w-[38rem] h-[38rem] rounded-full border border-accent/15" />
        <div className="absolute -left-36 top-1/2 -translate-y-1/2 w-[28rem] h-[28rem] rounded-full border border-accent/10" />
        <div className="relative z-10 flex flex-col justify-between max-w-2xl">
          <div className="flex items-center gap-3">
            <Logo size={42} />
            <span className="font-serif text-3xl tracking-wide">Caliber</span>
          </div>

          <div className="space-y-7">
            <p className="label text-accent!">Private watch intelligence</p>
            <h1 className="font-serif text-5xl 2xl:text-6xl leading-[1.08]">
              Your collection,
              <br />
              under lock and key.
            </h1>
            <p className="text-xl text-muted max-w-xl">
              Identification, provenance, values, and service history—protected behind your
              private Caliber login.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-3">
              {["Private collection", "Secure session", "30-day sign-in"].map((item) => (
                <div key={item} className="border-t border-accent/35 pt-3 text-sm text-muted">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted">Caliber · Built for collectors who care about the details.</p>
        </div>
      </section>

      <main className="relative flex min-w-0 min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <Logo size={38} />
            <span className="font-serif text-3xl tracking-wide">Caliber</span>
          </div>

          <div className="card p-7 sm:p-9 shadow-2xl shadow-black/30">
            <p className="label text-accent! mb-2">Private access</p>
            <h2 className="font-serif text-3xl">Welcome back</h2>
            <p className="text-muted mt-2 mb-7">
              Sign in with the same Caliber username and password you already use.
            </p>

            {error && (
              <p
                role="alert"
                className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg p-3 mb-5"
              >
                {error}
              </p>
            )}

            <form action="/api/auth/login" method="post" className="space-y-5">
              <input type="hidden" name="next" value={returnTo} />
              <div>
                <label htmlFor="user" className="label">Username</label>
                <input
                  id="user"
                  name="user"
                  defaultValue={process.env.CALIBER_AUTH_USER?.trim() || "caliber"}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  className="input mt-1.5"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="password" className="label">Password</label>
                  <span className="text-xs text-muted">Stored by your password manager</span>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="input mt-1.5"
                />
              </div>
              <button type="submit" className="btn btn-gold w-full">
                Sign in to Caliber
              </button>
            </form>

            <p className="text-xs text-muted text-center mt-6">
              Your session is signed, HTTP-only, and stays active for 30 days.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
