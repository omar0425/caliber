"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: string;
  createdAt: string;
  level: string;
  source: string;
  message: string;
  detail: string | null;
  status: number | null;
};

// Settings → Error log. Errors are recorded server-side (and by the client
// error boundaries) so a bug can be diagnosed from the phone the app runs on,
// instead of the hosting provider's dashboard.
export default function ErrorLogViewer() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/logs?limit=50");
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setEntries([]);
    }
  }, []);

  // Deferred like the other Settings loaders: setState directly inside an
  // effect body triggers cascading renders (and the repo's lint rule).
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function clearLog() {
    if (!confirm("Clear the error log? This only deletes log entries, never watches.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/logs", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not clear the log.");
      setNotice(`Cleared ${data.cleared} entr${data.cleared === 1 ? "y" : "ies"}.`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not clear the log.");
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    if (!entries?.length) return;
    const text = entries
      .map((entry) =>
        [
          `[${new Date(entry.createdAt).toLocaleString()}] ${entry.level.toUpperCase()} ${entry.source}` +
            (entry.status ? ` (HTTP ${entry.status})` : ""),
          entry.message,
          entry.detail ?? "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied — paste it into a bug report.");
    } catch {
      setNotice("Couldn't copy automatically. Tap an entry to select its details.");
    }
  }

  return (
    <div className="card min-w-0 space-y-4 p-4 sm:p-6">
      <div>
        <h3 className="font-serif text-xl">Error log</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">
          Problems Caliber runs into are recorded here — including failures that happen on your
          phone — so a bug can be diagnosed without digging through server logs. API keys,
          passwords, and photo data are stripped before anything is written.
        </p>
      </div>

      {entries === null ? (
        <p className="text-[15px] text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-good">No errors recorded. ✓</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 min-[400px]:flex-row">
            <button onClick={copyAll} className="btn btn-ghost min-h-12 w-full text-base min-[400px]:w-auto">
              Copy all details
            </button>
            <button
              onClick={clearLog}
              disabled={busy}
              className="btn btn-ghost min-h-12 w-full text-base text-danger! border-danger/40! min-[400px]:w-auto"
            >
              {busy ? "Clearing…" : "Clear log"}
            </button>
          </div>

          <ul className="min-w-0 divide-y divide-line/50">
            {entries.map((entry) => {
              const isOpen = expanded === entry.id;
              return (
                <li key={entry.id} className="min-w-0 py-3">
                  <button
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    className="w-full text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                        style={{
                          color: entry.level === "warn" ? "var(--color-warn)" : "var(--color-danger)",
                          borderColor:
                            entry.level === "warn"
                              ? "color-mix(in srgb, var(--color-warn) 40%, transparent)"
                              : "color-mix(in srgb, var(--color-danger) 40%, transparent)",
                        }}
                      >
                        {entry.level}
                      </span>
                      <span className="break-words text-sm text-accent-soft [overflow-wrap:anywhere]">
                        {entry.source}
                      </span>
                      {entry.status !== null && (
                        <span className="text-sm text-muted">HTTP {entry.status}</span>
                      )}
                      <span className="text-sm text-muted">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </span>
                    <span className="mt-1 block break-words text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">
                      {entry.message}
                    </span>
                  </button>
                  {isOpen && entry.detail && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-line/70 bg-surface-2/40 p-3 text-xs leading-relaxed whitespace-pre-wrap text-muted">
                      {entry.detail}
                    </pre>
                  )}
                  {isOpen && !entry.detail && (
                    <p className="mt-2 text-sm text-muted">No further detail recorded.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {notice && <p className="text-[15px] leading-relaxed text-muted">{notice}</p>}
    </div>
  );
}
