"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type PhotoLite = { id: string; url: string; caption: string | null };

export default function PhotoGallery({
  watchId,
  photos,
  coverUrl,
}: {
  watchId: string;
  photos: PhotoLite[];
  coverUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("photos", f));
      const res = await fetch(`/api/watches/${watchId}/photos`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setCover(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setCover: true }),
      });
      if (!res.ok) throw new Error("Could not change the cover photo.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the cover photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm("Delete this photo? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the photo.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card min-w-0 space-y-4 p-4 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-3 min-[400px]:flex-row min-[400px]:items-center">
        <h3 className="font-serif text-2xl">Photos</h3>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn btn-ghost min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
          {busy ? "Uploading…" : "+ Add photos"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {error && <p className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-muted">No photos yet. Add dial, caseback, movement, and clasp shots.</p>
      ) : (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p) => {
            const isCover = p.url === coverUrl;
            return (
              <div key={p.id} className="relative min-w-0 aspect-square overflow-hidden rounded-lg border border-line">
                <a href={p.url} target="_blank" rel="noreferrer" aria-label="View full photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? "Watch photo"} className="w-full h-full object-cover" />
                </a>
                {isCover && (
                  <span className="absolute top-1 left-1 rounded bg-accent px-2 py-1 text-sm font-semibold text-black">
                    Cover
                  </span>
                )}
                {/* Always-visible action bar (touch-friendly — no hover required) */}
                <div className="absolute inset-x-0 bottom-0 flex bg-black/60 text-sm font-medium backdrop-blur-sm">
                  {!isCover ? (
                    <button disabled={busy} onClick={() => setCover(p.id)} className="min-h-11 min-w-0 flex-1 px-1 text-accent active:bg-white/10">
                      ★ Cover
                    </button>
                  ) : (
                    <span className="flex min-h-11 min-w-0 flex-1 items-center justify-center px-1 text-muted">Cover</span>
                  )}
                  <button disabled={busy} onClick={() => remove(p.id)} className="min-h-11 min-w-0 flex-1 border-l border-white/10 px-1 text-danger active:bg-white/10">
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
