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

  const due = nextServiceDue(lastServicedDate, purchaseDate, Number(interval) || 5);
  const status = serviceStatus(due);

  async function add() {
    if (!date) return;
    setBusy(true);
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
    await fetch(`/api/service/${id}`, { method: "DELETE" });
    router.refresh();
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
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-serif text-xl">Service &amp; maintenance</h3>
        <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost text-sm py-1.5!">
          {open ? "Cancel" : "+ Log service"}
        </button>
      </div>

      {/* Status banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 border border-line/60">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SERVICE_COLOR[status] }} />
        <div className="flex-1 text-sm">
          <span style={{ color: SERVICE_COLOR[status] }} className="font-medium">{SERVICE_LABEL[status]}</span>
          {due && (
            <span className="text-muted">
              {" "}· next due {due.toLocaleDateString()}
              {lastServicedDate ? "" : " (based on purchase date)"}
            </span>
          )}
        </div>
        <label className="text-xs text-muted flex items-center gap-1.5">
          Every
          <select value={interval} onChange={(e) => saveInterval(e.target.value)} className="input py-1! px-2! text-xs w-16">
            {[3, 4, 5, 6, 7, 10].map((y) => (
              <option key={y} value={y}>{y}y</option>
            ))}
          </select>
        </label>
      </div>

      {/* Add form */}
      {open && (
        <div className="space-y-3 p-4 rounded-lg border border-line/60">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input mt-1" />
            </div>
            <div>
              <label className="label">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input mt-1">
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Watchmaker / service center</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} className="input mt-1" placeholder="e.g. Rolex Service Center" />
            </div>
            <div>
              <label className="label">Cost (USD)</label>
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="input mt-1" placeholder="e.g. 800" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input mt-1" placeholder="Work performed, parts replaced…" />
          </div>
          <button onClick={add} disabled={busy || !date} className="btn btn-gold text-sm">
            {busy ? "Saving…" : "Save service record"}
          </button>
        </div>
      )}

      {/* History */}
      {records.length === 0 ? (
        <p className="text-muted text-sm">No service records yet.</p>
      ) : (
        <ul className="divide-y divide-line/50">
          {records.map((r) => (
            <li key={r.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm">
                  <span className="font-medium">{r.type}</span>
                  <span className="text-muted"> · {new Date(r.date).toLocaleDateString()}</span>
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {[r.provider, r.cost != null ? `$${r.cost.toLocaleString()}` : null, r.notes]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button onClick={() => remove(r.id)} className="text-xs text-danger hover:underline shrink-0">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
