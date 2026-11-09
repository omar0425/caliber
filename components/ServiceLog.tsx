"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { nextServiceDue, serviceStatus, SERVICE_LABEL, SERVICE_COLOR } from "@/lib/service";
import { MONEY_HINT, parseMoney } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { errorMessage, fetchJson } from "@/lib/fetchJson";

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
  const fieldId = useId();

  const due = nextServiceDue(lastServicedDate, purchaseDate, Number(interval) || 5);
  const status = serviceStatus(due);

  async function add() {
    if (!date || busy) return;
    setError(null);
    const parsedCost = parseMoney(cost);
    if (Number.isNaN(parsedCost)) {
      setError(`Service cost: ${MONEY_HINT}`);
      return;
    }
    setBusy(true);
    try {
      await fetchJson(`/api/watches/${watchId}/service`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, type, provider, cost: parsedCost, notes }),
      });
      // Only clear the form once the record is really saved — on failure the
      // collector keeps everything they typed and sees why.
      setOpen(false);
      setDate(""); setProvider(""); setCost(""); setNotes(""); setType("Full service");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "Could not save the service record."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm("Delete this service record? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/service/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "Could not delete the service record."));
    } finally {
      setBusy(false);
    }
  }

  async function saveInterval(v: string) {
    const previous = interval;
    setInterval(v);
    setError(null);
    try {
      await fetchJson(`/api/watches/${watchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIntervalYears: Number(v) }),
      });
      router.refresh();
    } catch (e) {
      setInterval(previous);
      setError(errorMessage(e, "Could not change the service interval."));
    }
  }

  return (
    <div className="card min-w-0 space-y-4 p-4 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-3 min-[400px]:flex-row min-[400px]:items-center">
        <h3 className="font-serif text-2xl leading-tight">Service &amp; maintenance</h3>
        <button type="button" onClick={() => { setOpen((o) => !o); setError(null); }} className="btn btn-ghost min-h-12 w-full max-w-full min-[400px]:w-auto">
          {open ? "Cancel" : "+ Log service"}
        </button>
      </div>

      {error && !open && (
        <p role="alert" className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">
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
                {" "}· next due {formatDateOnly(due)}
                {lastServicedDate ? "" : " (based on purchase date)"}
              </span>
            )}
          </div>
        </div>
        <label className="flex min-h-11 w-full items-center justify-between gap-2 text-sm text-muted min-[430px]:w-auto min-[430px]:justify-start">
          Every
          <select value={interval} onChange={(e) => saveInterval(e.target.value)} className="input input-sm min-h-11 w-20">
            {[3, 4, 5, 6, 7, 10].map((y) => (
              <option key={y} value={y}>{y}y</option>
            ))}
          </select>
        </label>
      </div>

      {/* Add form */}
      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
          className="min-w-0 space-y-4 rounded-lg border border-line/60 p-4"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${fieldId}-date`} className="label text-sm">Date</label>
              <input id={`${fieldId}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input mt-1 min-h-12" />
            </div>
            <div>
              <label htmlFor={`${fieldId}-type`} className="label text-sm">Type</label>
              <select id={`${fieldId}-type`} value={type} onChange={(e) => setType(e.target.value)} className="input mt-1 min-h-12">
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-provider`} className="label text-sm">Watchmaker / service center</label>
              <input id={`${fieldId}-provider`} value={provider} onChange={(e) => setProvider(e.target.value)} className="input mt-1 min-h-12" placeholder="e.g. Rolex Service Center" />
            </div>
            <div>
              <label htmlFor={`${fieldId}-cost`} className="label text-sm">Cost (USD)</label>
              <input id={`${fieldId}-cost`} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="input mt-1 min-h-12" placeholder="e.g. 800" />
            </div>
          </div>
          <div>
            <label htmlFor={`${fieldId}-notes`} className="label text-sm">Notes</label>
            <input id={`${fieldId}-notes`} enterKeyHint="done" value={notes} onChange={(e) => setNotes(e.target.value)} className="input mt-1 min-h-12" placeholder="Work performed, parts replaced…" />
          </div>
          {error && (
            <p role="alert" className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !date} className="btn btn-gold min-h-12 w-full max-w-full min-[400px]:w-auto">
            {busy ? "Saving…" : "Save service record"}
          </button>
        </form>
      )}

      {/* History */}
      {records.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-muted">No service records yet.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-line/50">
          {records.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-col items-start justify-between gap-2 py-3 min-[400px]:flex-row min-[400px]:gap-3">
              <div className="min-w-0">
                <p className="break-words leading-relaxed [overflow-wrap:anywhere]">
                  <span className="font-medium">{r.type}</span>
                  <span className="text-muted"> · {formatDateOnly(r.date)}</span>
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
