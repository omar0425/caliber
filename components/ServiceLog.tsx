"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nextServiceDue, serviceStatus, SERVICE_LABEL, SERVICE_COLOR } from "@/lib/service";

export type ServiceLite = {
  id: string;
  date: string;
  type: string;
  provider: string | null;
  cost: number | null;
  notes: string | null;
};

const TYPES = ["Full service", "Movement", "Polish / refinish", "Battery", "Other"];

export default function ServiceLog({
  watchId,
  records,
  lastServicedDate,
  purchaseDate,
  intervalYears,
}: {
  watchId: string;
  records: ServiceLite[];
  lastServicedDate: string | null;
  purchaseDate: string | null;
  intervalYears: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [type, setType] = useState("Full service");
  const [provider, setProvider] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [interval, setInterval] = useState(String(intervalYears ?? 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const due = nextServiceDue(lastServicedDate, purchaseDate, Number(interval) || 5);
  const status = serviceStatus(due);

  async function add() {
    if (!date) return;
    setBusy(true);
    setError(null);
    await fetch(`/api/watches/${watchId}/service`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, type, provider, cost, notes }),
    });
    setBusy(false);
    setOpen(false);
    setDate(""); setProvider(""); setCost(""); setNotes(""); setType("Full service");
    router.refresh();
  }

  async function remove(id: string) {
    if (busy || !confirm("Delete this service record? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/service/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the service record.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the service record.");
    } finally {
      setBusy(false);
    }
  }

  async function saveInterval(v: string) {
    setInterval(v);
    await fetch(`/api/watches/${watchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceIntervalYears: Number(v) }),
    });
    router.refresh();
  }

  return (
    <div className="card min-w-0 space-y-4 p-4 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-3 min-[400px]:flex-row min-[400px]:items-center">
        <h3 className="font-serif text-2xl leading-tight">Service &amp; maintenance</h3>
        <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
          {open ? "Cancel" : "+ Log service"}
        </button>
      </div>

      {error && (
        <p className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">
          {error}
        </p>
      )}

      {/* Status banner */}
      <div className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-line/60 bg-surface-2 p-4 min-[430px]:flex-row min-[430px]:items-center">
        <div className="flex w-full min-w-0 items-start gap-3">
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: SERVICE_COLOR[status] }} />
          <div className="min-w-0 flex-1 break-words text-[15px] leading-relaxed [overflow-wrap:anywhere]">
            <span style={{ color: SERVICE_COLOR[status] }} className="font-medium">{SERVICE_LABEL[status]}</span>
            {due && (
              <span className="text-muted">
                {" "}· next due {due.toLocaleDateString()}
                {lastServicedDate ? "" : " (based on purchase date)"}
              </span>
            )}
          </div>
        </div>
        <label className="flex min-h-11 w-full items-center justify-between gap-2 text-sm text-muted min-[430px]:w-auto min-[430px]:justify-start">
          Every
          <select value={interval} onChange={(e) => saveInterval(e.target.value)} className="input min-h-11 w-20 px-2! py-1! text-base">
            {[3, 4, 5, 6, 7, 10].map((y) => (
              <option key={y} value={y}>{y}y</option>
            ))}
          </select>
        </label>
      </div>

      {/* Add form */}
      {open && (
        <div className="min-w-0 space-y-4 rounded-lg border border-line/60 p-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-sm">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input mt-1 min-h-12 text-base" />
            </div>
            <div>
              <label className="label text-sm">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input mt-1 min-h-12 text-base">
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-sm">Watchmaker / service center</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} className="input mt-1 min-h-12 text-base" placeholder="e.g. Rolex Service Center" />
            </div>
            <div>
              <label className="label text-sm">Cost (USD)</label>
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="input mt-1 min-h-12 text-base" placeholder="e.g. 800" />
            </div>
          </div>
          <div>
            <label className="label text-sm">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input mt-1 min-h-12 text-base" placeholder="Work performed, parts replaced…" />
          </div>
          <button onClick={add} disabled={busy || !date} className="btn btn-gold min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
            {busy ? "Saving…" : "Save service record"}
          </button>
        </div>
      )}

      {/* History */}
      {records.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-muted">No service records yet.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-line/50">
          {records.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-col items-start justify-between gap-2 py-3 min-[400px]:flex-row min-[400px]:gap-3">
              <div className="min-w-0">
                <p className="break-words text-base leading-relaxed [overflow-wrap:anywhere]">
                  <span className="font-medium">{r.type}</span>
                  <span className="text-muted"> · {new Date(r.date).toLocaleDateString()}</span>
                </p>
                <p className="mt-1 break-words text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">
                  {[r.provider, r.cost != null ? `$${r.cost.toLocaleString()}` : null, r.notes]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button disabled={busy} onClick={() => remove(r.id)} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-danger hover:underline">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
