"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

  async function loadUsage() {
    const res = await fetch("/api/usage");
    if (res.ok) {
      const u: Usage = await res.json();
      setUsage(u);
      setBudgetInput(u.budget ? String(u.budget) : "");
    }
  }

  async function saveBudget() {
    setBudgetMsg(null);
    const res = await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget: budgetInput.trim() === "" ? null : Number(budgetInput) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBudgetMsg(data.error || "Failed to save.");
      return;
    }
    setBudgetMsg(data.budget ? `Budget set to $${data.budget}. You'll be warned near it.` : "Budget cleared.");
    loadUsage();
  }

  async function importBackup(file: File | undefined, mode: "merge" | "replace") {
    if (!file) return;
    setImportMsg("Importing…");
    try {
      const json = JSON.parse(await file.text());
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watches: json.watches, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      setImportMsg(`Imported ${data.imported} watch${data.imported === 1 ? "" : "es"}.`);
      router.refresh();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Import failed.");
    }
  }

  async function loadOwnership() {
    const res = await fetch("/api/watches/assign-owner");
    if (res.ok) setOwnership(await res.json());
  }

  async function assignOwner() {
    if (!ownership) return;
    const owner = ownerInput.trim();
    if (!owner) return;
    if (!confirm(`Mark all ${ownership.unassigned} watches that have no owner yet as belonging to “${owner}”?`)) return;
    setAssigning(true);
    setOwnerMsg(null);
    try {
      const res = await fetch("/api/watches/assign-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign owner.");
      setOwnerMsg(`Done — ${data.updated} watch${data.updated === 1 ? "" : "es"} marked as ${data.owner}'s.`);
      setOwnerInput("");
      loadOwnership();
    } catch (e) {
      setOwnerMsg(e instanceof Error ? e.message : "Failed to assign owner.");
    } finally {
      setAssigning(false);
    }
  }

  async function load() {
    const res = await fetch("/api/settings");
    setStatus(await res.json());
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void loadUsage();
      void loadOwnership();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setStatus(data);
      setKey("");
      setNotice("API key saved. Caliber is now live — identify and vetting use real AI.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Remove the saved API key? AI analysis will be paused.")) return;
    const res = await fetch("/api/settings", { method: "DELETE" });
    setStatus(await res.json());
    setNotice("API key removed. AI analysis is paused; no sample results will be substituted.");
  }

  const live = status?.configured;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="text-muted mt-1">Connect your OpenAI API key to turn on real AI analysis.</p>
      </div>
      <div className="rule" />

      {/* Status banner */}
      <div className="card p-5 flex items-center gap-4">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: live ? "var(--color-good)" : "var(--color-warn)" }}
        />
        <div className="flex-1">
          <p className="font-medium">
            {live ? "Live — real AI enabled" : "AI paused — no API key configured"}
          </p>
          <p className="text-sm text-muted">
            {status?.source === "app" && `Key configured in-app (${status.masked}).`}
            {status?.source === "env" && "Key loaded from the OPENAI_API_KEY environment variable."}
            {status?.source === "none" && "No API key set. Add one below to analyze real photos."}
          </p>
        </div>
      </div>

      {/* Key form */}
      <div className="card p-6 space-y-4">
        <div>
          <label className="label">OpenAI API key</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-..."
            className="input mt-1 font-mono"
            autoComplete="off"
          />
          <p className="text-xs text-muted mt-2">
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
          <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>
        )}
        {notice && (
          <p className="text-good text-sm bg-good/10 border border-good/30 rounded-lg p-3">{notice}</p>
        )}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving || !key.trim()} className="btn btn-gold">
            {saving ? "Saving…" : live ? "Update key" : "Save & go live"}
          </button>
          {status?.source === "app" && (
            <button onClick={remove} className="btn btn-ghost text-danger! border-danger/40!">
              Remove key
            </button>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-serif text-lg mb-2">How your key is used</h3>
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li>Powers watch recognition, spec research, and the authenticity vetting engine.</li>
          <li>
            {status?.source === "app" && status.protectedAtRest
              ? "The saved key is encrypted at rest using your deployment secret."
              : "Deployment environment secrets are preferred for production."}
          </li>
          <li>You&apos;re billed by OpenAI per analysis; Caliber uses the cost-efficient Luna model by default.</li>
          <li>Remove it anytime to pause paid AI calls; Caliber will not substitute sample results.</li>
        </ul>
      </div>

      {/* Usage & budget */}
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="font-serif text-lg">AI usage &amp; budget</h3>
          <p className="text-sm text-muted mt-1">
            Estimated spend from your analyses. Set a monthly budget to get a warning banner as you
            approach it. Caliber blocks new AI calls when the budget is reached. This remains an
            estimate—check actual usage on{" "}
            <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              platform.openai.com
            </a>
            .
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
        </div>

        <div>
          <label className="label">Monthly budget (USD, optional)</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 20"
              className="input max-w-40"
            />
            <button onClick={saveBudget} className="btn btn-gold text-sm">Save budget</button>
            {budgetInput && (
              <button onClick={() => { setBudgetInput(""); }} className="btn btn-ghost text-sm">Clear</button>
            )}
          </div>
          {budgetMsg && <p className="text-sm text-muted mt-2">{budgetMsg}</p>}
          <p className="text-xs text-muted mt-2">
            You&apos;ll see an amber banner at 80%. At 100%, new AI analyses are blocked until the
            budget is raised or the month changes.
          </p>
        </div>
      </div>

      {/* Ownership */}
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="font-serif text-lg">Ownership</h3>
          <p className="text-sm text-muted mt-1">
            Access is protected by the deployment login. The Owner field lets you distinguish
            watches when a household shares one Caliber deployment.
          </p>
        </div>

        {ownership && (
          <p className="text-sm text-muted">
            {ownership.total} watch{ownership.total === 1 ? "" : "es"} in the database
            {" — "}
            {ownership.unassigned} with no owner recorded
            {ownership.owners.map((o) => `, ${o.count} marked ${o.owner}`).join("")}.
          </p>
        )}

        <div>
          <label className="label">Owner name or email</label>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input
              value={ownerInput}
              onChange={(e) => setOwnerInput(e.target.value)}
              placeholder="e.g. mike@example.com"
              className="input max-w-xs"
            />
            <button
              onClick={assignOwner}
              disabled={assigning || !ownerInput.trim() || !ownership || ownership.unassigned === 0}
              className="btn btn-gold text-sm w-full sm:w-auto whitespace-normal!"
            >
              {assigning
                ? "Assigning…"
                : `Mark ${ownership ? ownership.unassigned : "all"} unassigned watch${ownership?.unassigned === 1 ? "" : "es"} as theirs`}
            </button>
          </div>
          {ownerMsg && <p className="text-sm text-muted mt-2">{ownerMsg}</p>}
          <p className="text-xs text-muted mt-2">
            Only watches without an owner are touched, so it&apos;s safe to run again later for a
            different person — already-assigned watches keep their owner.
          </p>
        </div>
      </div>

      {/* Backup & export */}
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="font-serif text-lg">Backup &amp; export</h3>
          <p className="text-sm text-muted mt-1">
            Your collection lives in a local database. Export regularly so you never lose it.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export?format=json" className="btn btn-gold text-sm">Download backup (JSON)</a>
          <a href="/api/export?format=csv" className="btn btn-ghost text-sm">Export spreadsheet (CSV)</a>
          <a href="/appraisal" target="_blank" className="btn btn-ghost text-sm">Appraisal report (PDF)</a>
          <button onClick={() => importRef.current?.click()} className="btn btn-ghost text-sm">Restore from backup</button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && confirm("Restore watches from this backup? This adds them to your collection.")) {
                importBackup(f, "merge");
              }
              e.target.value = "";
            }}
          />
        </div>
        {importMsg && <p className="text-sm text-muted">{importMsg}</p>}
        <p className="text-xs text-muted">
          The appraisal report opens a print-ready page — use your browser&apos;s “Save as PDF” for insurance documentation.
        </p>
      </div>
    </div>
  );
}
