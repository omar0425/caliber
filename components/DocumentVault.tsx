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
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-serif text-xl">Documents &amp; provenance</h3>
        <div className="flex items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input py-1.5! text-sm max-w-40">
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </select>
          <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn btn-ghost text-sm py-1.5!">
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

      {error && <p className="text-danger text-sm">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-muted text-sm">No documents yet. Store receipts, box &amp; papers, and service invoices here.</p>
      ) : (
        <ul className="divide-y divide-line/50">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-sm hover:text-accent truncate block">
                  {d.name}
                </a>
                <span className="text-xs text-muted">{KIND_LABEL[d.kind] ?? d.kind}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                  Open
                </a>
                <button onClick={() => remove(d.id)} className="text-xs text-danger hover:underline">
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
