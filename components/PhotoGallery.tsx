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
    await fetch(`/api/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setCover: true }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/photos/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Photos</h3>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn btn-ghost text-sm py-1.5!">
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

      {error && <p className="text-danger text-sm">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-muted text-sm">No photos yet. Add dial, caseback, movement, and clasp shots.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {photos.map((p) => {
            const isCover = p.url === coverUrl;
            return (
              <div key={p.id} className="group relative aspect-square rounded-lg overflow-hidden border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? "Watch photo"} className="w-full h-full object-cover" />
                {isCover && (
                  <span className="absolute top-1 left-1 text-[10px] bg-accent text-black px-1.5 py-0.5 rounded font-semibold">
                    Cover
                  </span>
                )}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 text-xs">
                  {!isCover && (
                    <button onClick={() => setCover(p.id)} className="text-accent hover:underline">
                      Set as cover
                    </button>
                  )}
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                    View full
                  </a>
                  <button onClick={() => remove(p.id)} className="text-danger hover:underline">
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
