"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ErrorLogViewer from "@/components/ErrorLogViewer";
import { errorMessage, fetchJson } from "@/lib/fetchJson";
import Link from "next/link";
import { downloadLargeExport, saveExport } from "@/lib/download";
import { readBackupZip, restoreBackup } from "@/lib/restore";
import { LAST_BACKUP_KEY } from "@/components/GettingStarted";

type Status = {
  configured: boolean;
  source: "app" | "env" | "none";
  masked: string | null;
  protectedAtRest: boolean;
};
type Usage = {
  monthSpend: number;
  monthCalls: number;
  allTimeSpend: number;
  averageIdentifyCost: number;
  identifyCalls: number;
  identifySpend: number;
  budget: number | null;
  level: "none" | "ok" | "low" | "over";
};
type Ownership = {
  total: number;
  unassigned: number;
  owners: { owner: string; count: number }[];
};

export default function SettingsPage() {
  const router = useRouter();
  const importRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [ownerInput, setOwnerInput] = useState("");
  const [ownerMsg, setOwnerMsg] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"json" | "csv" | "zip" | null>(null);
  const advancedRef = useRef<HTMLDetailsElement>(null);

  async function loadUsage() {
    try {
      const u = await fetchJson<Usage>("/api/usage");
      setUsage(u);
      setBudgetInput(u.budget ? String(u.budget) : "");
    } catch {
      /* usage is informational — the rest of Settings still works */
    }
  }

  // `value` lets "Clear" save immediately instead of only emptying the field.
  async function saveBudget(value: string = budgetInput) {
    setBudgetMsg(null);
    try {
      const data = await fetchJson<{ budget?: number | null }>("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: value.trim() === "" ? null : Number(value) }),
      });
      setBudgetMsg(data.budget ? `Budget set to $${data.budget}. You'll be warned near it.` : "Budget cleared.");
      loadUsage();
    } catch (e) {
      setBudgetMsg(errorMessage(e, "Failed to save."));
    }
  }

  async function exportFile(format: "json" | "csv" | "zip") {
    setExporting(format);
    setImportMsg(null);
    try {
      const result =
        format === "zip"
          ? await downloadLargeExport("/api/export?format=zip", "caliber-full-backup.zip")
          : await saveExport(
              `/api/export?format=${format}`,
              format === "json" ? "caliber-backup.json" : "caliber-collection.csv"
            );
      if (result !== "cancelled") {
        setImportMsg(
          format === "zip"
            ? "Full backup is downloading (photos included — it can take a minute). Keep it somewhere safe."
            : format === "json"
              ? "Backup saved. Keep it somewhere safe (Files, iCloud, email)."
              : "Spreadsheet exported."
        );
        if (format !== "csv") {
          try {
            window.localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
          } catch {
            /* the checklist just won't tick */
          }
        }
      }
    } catch (e) {
      setImportMsg(errorMessage(e, "The export failed."));
    } finally {
      setExporting(null);
    }
  }

  // A full-backup ZIP brings photos and documents back too; a JSON backup
  // restores the records only.
  async function importBackup(file: File | undefined, mode: "merge" | "replace") {
    if (!file) return;
    if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
      setImportMsg("Reading the backup…");
      try {
        const backup = await readBackupZip(file);
        if (
          !confirm(
            `Restore ${backup.watches.length} watch${backup.watches.length === 1 ? "" : "es"} and ${backup.files.length} photos/documents from this backup? ` +
              "Watches already in your collection are skipped; photos already on the server are kept."
          )
        ) {
          setImportMsg(null);
          return;
        }
        const result = await restoreBackup(backup, setImportMsg);
        setImportMsg(
          `Restored ${result.imported} watch${result.imported === 1 ? "" : "es"} and ${result.restored} photos/documents` +
            (result.alreadyThere ? ` (${result.alreadyThere} were already on the server)` : "") +
            (result.skipped ? `. ${result.skipped} watch${result.skipped === 1 ? " was" : "es were"} already in your collection and skipped` : "") +
            (result.failed.length
              ? `. ${result.failed.length} files couldn't be restored: ${result.failed.slice(0, 5).join(", ")}${result.failed.length > 5 ? "…" : ""}`
              : ".")
        );
        router.refresh();
      } catch (e) {
        setImportMsg(e instanceof SyntaxError ? "The backup inside this ZIP is damaged." : errorMessage(e, "Restore failed."));
      }
      return;
    }
    if (!confirm("Restore watches from this backup? Watches already in your collection are skipped. (A data-only backup restores records, not photos.)")) return;
    setImportMsg("Importing…");
    try {
      const json = JSON.parse(await file.text());
      const data = await fetchJson<{ imported: number; skipped?: number }>("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watches: json.watches, mode }),
      });
      setImportMsg(
        `Imported ${data.imported} watch${data.imported === 1 ? "" : "es"}.` +
          (data.skipped ? ` ${data.skipped} already in your collection ${data.skipped === 1 ? "was" : "were"} skipped.` : "")
      );
      router.refresh();
    } catch (e) {
      setImportMsg(e instanceof SyntaxError ? "That file isn't a Caliber backup." : errorMessage(e, "Import failed."));
    }
  }

  async function loadOwnership() {
    try {
      setOwnership(await fetchJson<Ownership>("/api/watches/assign-owner"));
    } catch {
      /* ownership summary is optional */
    }
  }

  async function assignOwner() {
    if (!ownership) return;
    const owner = ownerInput.trim();
    if (!owner) return;
    if (!confirm(`Mark all ${ownership.unassigned} watches that have no owner yet as belonging to “${owner}”?`)) return;
    setAssigning(true);
    setOwnerMsg(null);
    try {
      const data = await fetchJson<{ updated: number; owner: string }>("/api/watches/assign-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner }),
      });
      setOwnerMsg(`Done — ${data.updated} watch${data.updated === 1 ? "" : "es"} marked as ${data.owner}'s.`);
      setOwnerInput("");
      loadOwnership();
    } catch (e) {
      setOwnerMsg(errorMessage(e, "Failed to assign owner."));
    } finally {
      setAssigning(false);
    }
  }

  async function load() {
    try {
      setStatus(await fetchJson<Status>("/api/settings"));
    } catch (e) {
      setError(errorMessage(e, "Couldn't load the AI settings."));
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void loadUsage();
      void loadOwnership();
      const url = new URL(window.location.href);
      if (url.searchParams.get("password") === "changed") {
        setPasswordNotice("Password changed. This device stays signed in; any other signed-in devices now need the new password.");
      }
      const passwordFailure = url.searchParams.get("passwordError");
      const passwordFailureMessages: Record<string, string> = {
        "missing-current": "Enter your current password.",
        "too-short": "Use at least 12 characters for the new password.",
        "too-long": "That password is too long.",
        same: "Choose a different new password.",
        mismatch: "The new passwords do not match.",
        incorrect: "The current password is incorrect.",
      };
      if (passwordFailure && passwordFailureMessages[passwordFailure]) {
        setPasswordError(passwordFailureMessages[passwordFailure]);
      }
      if (url.searchParams.has("password") || url.searchParams.has("passwordError")) {
        url.searchParams.delete("password");
        url.searchParams.delete("passwordError");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const data = await fetchJson<Status>("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      setStatus(data);
      setKey("");
      setNotice("API key saved. Caliber is now live — identify and vetting use real AI.");
    } catch (e) {
      setError(errorMessage(e, "Failed to save."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Remove the saved API key? AI analysis will be paused.")) return;
    setError(null);
    try {
      setStatus(await fetchJson<Status>("/api/settings", { method: "DELETE" }));
      setNotice("API key removed. AI analysis is paused; no sample results will be substituted.");
    } catch (e) {
      setError(errorMessage(e, "Couldn't remove the key."));
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentPassword = String(fields.get("currentPassword") ?? "");
    const newPassword = String(fields.get("newPassword") ?? "");
    const confirmPassword = String(fields.get("confirmPassword") ?? "");
    setPasswordError(null);
    setPasswordNotice(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      await fetchJson("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      form.reset();
      setPasswordNotice("Password changed. This device stays signed in; any other signed-in devices now need the new password.");
    } catch (e) {
      setPasswordError(errorMessage(e, "Unable to change the password."));
    } finally {
      setPasswordSaving(false);
    }
  }

  const live = status?.configured;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="text-muted mt-1 leading-relaxed">Back up your collection, manage your sign-in, and control AI analysis.</p>
      </div>
      <div className="rule" />

      {/* Backup & export */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div>
          <h3 className="font-serif text-lg">Backup &amp; export</h3>
          <p className="text-muted mt-1 leading-relaxed">
            Your collection lives in a local database. Export regularly so you never lose it.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <button onClick={() => exportFile("zip")} disabled={exporting !== null} className="btn btn-gold w-full sm:w-auto">
            {exporting === "zip" ? "Starting…" : "Download full backup (with photos)"}
          </button>
          <button onClick={() => exportFile("json")} disabled={exporting !== null} className="btn btn-ghost w-full sm:w-auto">
            {exporting === "json" ? "Preparing…" : "Data-only backup (JSON)"}
          </button>
          <button onClick={() => exportFile("csv")} disabled={exporting !== null} className="btn btn-ghost w-full sm:w-auto">
            {exporting === "csv" ? "Preparing…" : "Export spreadsheet (CSV)"}
          </button>
          <Link href="/appraisal" className="btn btn-ghost w-full sm:w-auto">Appraisal report (PDF)</Link>
          <button onClick={() => importRef.current?.click()} className="btn btn-ghost w-full sm:w-auto">Restore from backup</button>
          <input
            ref={importRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importBackup(f, "merge");
            }}
          />
        </div>
        {importMsg && <p className="text-muted">{importMsg}</p>}
        <p className="text-[0.95rem] text-muted leading-relaxed">
          The full backup includes every photo and document, so it&apos;s a large file — best saved on
          Wi-Fi or from a computer. The data-only backup is small but doesn&apos;t include the pictures.
          Restore accepts either.
        </p>
        <p className="text-[0.95rem] text-muted leading-relaxed">
          The appraisal report opens a print-ready page — use your browser&apos;s “Save as PDF” for insurance documentation.
        </p>
      </div>

      {/* Data gap worth surfacing even though the tool lives under Advanced:
          most watches in a shared collection with no owner recorded. */}
      {ownership && ownership.unassigned > 0 && ownership.owners.length > 0 && (
        <div className="card p-4 sm:p-5 flex flex-col min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between gap-3">
          <p className="text-muted leading-relaxed">
            {ownership.unassigned} watch{ownership.unassigned === 1 ? " has" : "es have"} no owner recorded yet.
          </p>
          <button
            onClick={() => {
              if (advancedRef.current) advancedRef.current.open = true;
              window.setTimeout(() => document.getElementById("ownership")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
            className="btn btn-ghost w-full min-[400px]:w-auto"
          >
            Assign owners
          </button>
        </div>
      )}

      {/* Login security */}
      <form
        id="login-security"
        action="/api/auth/password"
        method="post"
        onSubmit={changePassword}
        className="card p-4 sm:p-6 space-y-4"
      >
        <div>
          <h3 className="font-serif text-lg">Login security</h3>
          <p className="text-muted mt-1 leading-relaxed">
            Change the password used by the Caliber sign-in screen. The new password is stored as
            a salted one-way hash and takes effect immediately.
          </p>
        </div>

        <div>
          <label htmlFor="current-password" className="label">Current password</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={512}
            required
            className="input mt-1.5"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="new-password" className="label">New password</label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={512}
              required
              className="input mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="label">Confirm new password</label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={512}
              required
              className="input mt-1.5"
            />
          </div>
        </div>

        {passwordError && (
          <p className="text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">
            {passwordError}
          </p>
        )}
        {passwordNotice && (
          <p className="text-good bg-good/10 border border-good/30 rounded-lg p-3">
            {passwordNotice}
          </p>
        )}

        <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-3">
          <button
            type="submit"
            disabled={passwordSaving}
            className="btn btn-gold w-full min-[400px]:w-auto"
          >
            {passwordSaving ? "Changing..." : "Change password"}
          </button>
          <p className="text-[0.95rem] text-muted">Use at least 12 characters.</p>
        </div>
      </form>

      {/* Sign out — moved here from the header, where a one-tap icon next to
          Settings signed people out by accident. */}
      <form
        action="/api/auth/logout"
        method="post"
        onSubmit={(event) => {
          if (!confirm("Sign out of Caliber on this device?")) event.preventDefault();
        }}
        className="card p-4 sm:p-6 flex flex-col min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between gap-3"
      >
        <div>
          <h3 className="font-serif text-lg">Sign out</h3>
          <p className="text-muted mt-1 leading-relaxed">You&apos;ll need your password to get back in.</p>
        </div>
        <button type="submit" className="btn btn-danger w-full min-[400px]:w-auto">Sign out</button>
      </form>

      {/* Status banner */}
      <div className="card p-4 sm:p-5 flex items-start gap-3 sm:gap-4 min-w-0">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 mt-2"
          style={{ background: live ? "var(--color-good)" : "var(--color-warn)" }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium">
            {live ? "AI analysis is on" : "AI analysis is paused — no key set (see Advanced below)"}
          </p>
          <p className="text-muted leading-relaxed break-words">
            {status?.source === "app" && `Key configured in-app (${status.masked}).`}
            {status?.source === "env" && "Key provided by the server."}
            {status?.source === "none" && "Photos can still be added manually; AI identification and vetting need a key."}
          </p>
        </div>
      </div>

      {/* Usage & budget */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div>
          <h3 className="font-serif text-lg">AI usage &amp; budget</h3>
          <p className="text-muted mt-1 leading-relaxed">
            Estimated spend from your analyses. Set a monthly budget to get a warning banner as you
            approach it. Caliber blocks new AI calls when the budget is reached. This remains an
            estimate—check actual usage on{" "}
            <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              platform.openai.com
            </a>
            .
          </p>
        </div>

        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="label">This month</p>
            <p className="font-serif text-xl mt-1 text-accent-soft">
              ${usage ? usage.monthSpend.toFixed(2) : "—"}
            </p>
          </div>
          <div className="card p-4">
            <p className="label">Analyses this month</p>
            <p className="font-serif text-xl mt-1">{usage ? usage.monthCalls : "—"}</p>
          </div>
          <div className="card p-4">
            <p className="label">All-time</p>
            <p className="font-serif text-xl mt-1">${usage ? usage.allTimeSpend.toFixed(2) : "—"}</p>
          </div>
          <div className="card p-4">
            <p className="label">Avg. completed identification</p>
            <p className="font-serif text-xl mt-1 text-accent-soft">
              ${usage?.averageIdentifyCost != null ? usage.averageIdentifyCost.toFixed(3) : "—"}
            </p>
            <p className="text-[0.95rem] text-muted mt-1">
              {usage?.identifyCalls ?? "—"} completed identification responses
            </p>
            <p className="text-[0.95rem] text-muted mt-1">
              ${usage ? usage.identifySpend.toFixed(2) : "—"} total identification spend
            </p>
          </div>
        </div>
        <p className="text-[0.95rem] text-muted leading-relaxed">
          This average covers completed OpenAI identification responses recorded by Caliber,
          including results later rejected for a visible brand conflict. Provider errors that
          returned no usable response are not present in older records, so the OpenAI Usage page
          remains the final billing total.
        </p>

        <div>
          <label htmlFor="settings-budget" className="label">Monthly budget (USD, optional)</label>
          <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-2 mt-1">
            <input
              id="settings-budget"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 20"
              className="input w-full min-[400px]:max-w-40"
            />
            <button onClick={() => saveBudget()} className="btn btn-gold w-full min-[400px]:w-auto">Save budget</button>
            {budgetInput && (
              <button onClick={() => { setBudgetInput(""); void saveBudget(""); }} className="btn btn-ghost w-full min-[400px]:w-auto">Clear</button>
            )}
          </div>
          {budgetMsg && <p className="text-muted mt-2">{budgetMsg}</p>}
          <p className="text-[0.95rem] text-muted mt-2 leading-relaxed">
            You&apos;ll see an amber banner at 80%. At 100%, new AI analyses are blocked until the
            budget is raised or the month changes.
          </p>
        </div>
      </div>

      {/* Advanced — setup and maintenance tools the collector rarely needs.
          Collapsed so the everyday settings come first on a phone. */}
      <details ref={advancedRef} className="group space-y-6">
        <summary className="card flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-serif text-lg">Advanced</span>
            <span className="block text-[0.95rem] text-muted">AI key, household owners, error log</span>
          </span>
          <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>▸</span>
        </summary>
        <div className="space-y-6 pt-6">
          {/* Key form */}
          <div className="card p-4 sm:p-6 space-y-4">
            <div>
              <label htmlFor="settings-api-key" className="label">OpenAI API key</label>
              <input
                id="settings-api-key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-..."
                className="input mt-1 font-mono"
                autoComplete="off"
              />
              <p className="text-[0.95rem] text-muted mt-2 leading-relaxed break-words">
                Get a key from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  platform.openai.com
                </a>
                . Prefer the OPENAI_API_KEY deployment secret. A key saved here is encrypted at rest when
                Caliber has a deployment encryption or login secret, and is sent only to OpenAI for analysis.
              </p>
            </div>

            {error && (
              <p className="text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>
            )}
            {notice && (
              <p className="text-good bg-good/10 border border-good/30 rounded-lg p-3">{notice}</p>
            )}

            <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-3">
              <button onClick={save} disabled={saving || !key.trim()} className="btn btn-gold w-full min-[400px]:w-auto">
                {saving ? "Saving…" : live ? "Update key" : "Save & go live"}
              </button>
              {status?.source === "app" && (
                <button onClick={remove} className="btn btn-danger w-full min-[400px]:w-auto">
                  Remove key
                </button>
              )}
            </div>
          </div>

          <div className="card p-4 sm:p-6">
            <h3 className="font-serif text-lg mb-2">How your key is used</h3>
            <ul className="text-muted space-y-2 list-disc pl-5 leading-relaxed">
              <li>Powers watch recognition, spec research, and the authenticity vetting engine.</li>
              <li>
                What is sent to OpenAI: the photo you identify, re-analyze or vet, any clue or listing
                text you type, and for chat, your messages plus that watch&apos;s details (including its
                condition and your notes). Caliber asks OpenAI not to store the responses; your OpenAI
                account&apos;s own data controls still apply.
              </li>
              <li>
                {status?.source === "app" && status.protectedAtRest
                  ? "The saved key is encrypted at rest using your deployment secret."
                  : "Deployment environment secrets are preferred for production."}
              </li>
              <li>You&apos;re billed by OpenAI per analysis; Caliber uses the cost-efficient Luna model by default.</li>
              <li>Remove it anytime to pause paid AI calls; Caliber will not substitute sample results.</li>
            </ul>
          </div>

          {/* Ownership */}
          <div id="ownership" className="card p-4 sm:p-6 space-y-4 scroll-mt-6">
            <div>
              <h3 className="font-serif text-lg">Ownership</h3>
              <p className="text-muted mt-1 leading-relaxed">
                Access is protected by the deployment login. The Owner field lets you distinguish
                watches when a household shares one Caliber deployment.
              </p>
            </div>

            {ownership && (
              <p className="text-muted leading-relaxed">
                {ownership.total} watch{ownership.total === 1 ? "" : "es"} in the database
                {" — "}
                {ownership.unassigned} with no owner recorded
                {ownership.owners.map((o) => `, ${o.count} marked ${o.owner}`).join("")}.
              </p>
            )}

            <div>
              <label htmlFor="settings-owner" className="label">Owner name or email</label>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mt-1">
                <input
                  id="settings-owner"
                  autoCorrect="off"
                  spellCheck={false}
                  value={ownerInput}
                  onChange={(e) => setOwnerInput(e.target.value)}
                  placeholder="e.g. mike@example.com"
                  className="input w-full sm:max-w-xs"
                />
                <button
                  onClick={assignOwner}
                  disabled={assigning || !ownerInput.trim() || !ownership || ownership.unassigned === 0}
                  className="btn btn-gold w-full sm:w-auto"
                >
                  {assigning
                    ? "Assigning…"
                    : `Mark ${ownership ? ownership.unassigned : "all"} unassigned watch${ownership?.unassigned === 1 ? "" : "es"} as theirs`}
                </button>
              </div>
              {ownerMsg && <p className="text-muted mt-2">{ownerMsg}</p>}
              <p className="text-[0.95rem] text-muted mt-2 leading-relaxed">
                Only watches without an owner are touched, so it&apos;s safe to run again later for a
                different person — already-assigned watches keep their owner.
              </p>
            </div>
          </div>

          {/* Error log */}
          <ErrorLogViewer />
        </div>
      </details>
    </div>
  );
}
