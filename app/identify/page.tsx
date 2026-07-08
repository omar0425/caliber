"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/UploadZone";
import SpecSheet from "@/components/SpecSheet";
import { WatchSpec } from "@/lib/types";

export default function IdentifyPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WatchSpec | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [cached, setCached] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("owned");

  function pickFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSpec(null);
    setError(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSpec(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/identify", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Identification failed.");
      setSpec(data.spec);
      setImageUrl(data.imageUrl);
      setDemoMode(data.demoMode);
      setCached(Boolean(data.cached));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!spec) return;
    setSaving(true);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...spec, status, imageUrl, specJson: JSON.stringify(spec) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      router.push(`/watch/${data.watch.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Identify a watch</h1>
        <p className="text-muted mt-1">
          Upload a clear photo. Caliber recognizes the piece, confirms specs against real sources,
          and estimates its market value.
        </p>
      </div>
      <div className="rule" />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <UploadZone onFile={pickFile} preview={preview} />
          <button onClick={analyze} disabled={!file || loading} className="btn btn-gold w-full">
            {loading ? "Analyzing…" : "Analyze photo"}
          </button>
          {error && (
            <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg p-3">
              {error}
            </p>
          )}
        </div>

        <div className="card p-6 min-h-64">
          {loading && (
            <div className="space-y-3">
              <div className="shimmer h-6 w-1/2 rounded bg-surface-2" />
              <div className="shimmer h-4 w-full rounded bg-surface-2" />
              <div className="shimmer h-4 w-2/3 rounded bg-surface-2" />
              <p className="text-muted text-sm pt-2">Researching reference & market value…</p>
            </div>
          )}
          {!loading && !spec && (
            <div className="h-full flex items-center justify-center text-center text-muted text-sm">
              Your spec sheet will appear here.
            </div>
          )}
          {spec && (
            <div className="space-y-5">
              {demoMode && (
                <p className="text-warn text-xs bg-warn/10 border border-warn/30 rounded-lg p-2.5">
                  Demo mode — add your API key on the{" "}
                  <a href="/settings" className="underline font-medium">Settings</a> page for real analysis.
                </p>
              )}
              {cached && (
                <p className="text-good text-xs bg-good/10 border border-good/30 rounded-lg p-2.5">
                  ✓ Loaded from a previous analysis of this exact photo — no new charge.
                </p>
              )}
              <SpecSheet spec={spec} />
              <div className="pt-2 border-t border-line/60 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="label">Add as</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="input max-w-40">
                    <option value="owned">Owned</option>
                    <option value="wishlist">Wishlist</option>
                    <option value="watching">Watching</option>
                  </select>
                </div>
                <button onClick={save} disabled={saving} className="btn btn-gold w-full">
                  {saving ? "Saving…" : "Save to collection"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
