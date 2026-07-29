"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type DocLite = { id: string; url: string; name: string; kind: string; mimeType: string | null };

const KINDS = [
  { key: "receipt", label: "Receipt" },
  { key: "warranty", label: "Warranty / papers" },
  { key: "service", label: "Service invoice" },
  { key: "certificate", label: "Certificate" },
  { key: "other", label: "Other" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));

export default function DocumentVault({ watchId, documents }: { watchId: string; documents: DocLite[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("receipt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      form.append("name", file.name);
      const res = await fetch(`/api/watches/${watchId}/documents`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm("Delete this document? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the document.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card min-w-0 space-y-4 p-4 sm:p-6">
      <div className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h3 className="break-words font-serif text-2xl leading-tight">Documents &amp; provenance</h3>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input min-h-12 min-w-0 max-w-none text-base sm:max-w-48">
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </select>
          <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn btn-ghost min-h-12 w-full max-w-full text-base sm:w-auto">
            {busy ? "Uploading…" : "+ Add"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      </div>

      {error && <p className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-muted">No documents yet. Store receipts, box &amp; papers, and service invoices here.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-line/50">
          {documents.map((d) => (
            <li key={d.id} className="flex min-w-0 flex-col items-start justify-between gap-2 py-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:gap-3">
              <div className="w-full min-w-0">
                <a href={d.url} target="_blank" rel="noreferrer" className="block break-words text-base leading-snug hover:text-accent [overflow-wrap:anywhere]">
                  {d.name}
                </a>
                <span className="mt-1 block text-sm text-muted">{KIND_LABEL[d.kind] ?? d.kind}</span>
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 min-[400px]:w-auto">
                <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm text-accent hover:underline min-[400px]:flex-none">
                  Open
                </a>
                <button disabled={busy} onClick={() => remove(d.id)} className="min-h-11 flex-1 rounded-lg px-3 text-sm text-danger hover:underline min-[400px]:flex-none">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
