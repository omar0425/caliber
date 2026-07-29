"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/UploadZone";
import SpecSheet from "@/components/SpecSheet";
import LensButton from "@/components/LensButton";
import { WatchSpec, WatchSpecSchema } from "@/lib/types";
import { safeStoredImageUrl } from "@/lib/uploadUrl";

const UNSAVED_WARNING =
  "This identification has not been saved. If you leave, the result will be lost and another analysis may cost money. Leave without saving?";
const IDENTIFY_DRAFT_KEY = "caliber:identify-draft:v1";

export default function IdentifyPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WatchSpec | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("owned");
  const [hint, setHint] = useState("");
  const [recovered, setRecovered] = useState(false);
  const allowLeaveRef = useRef(false);
  const restoringHistoryRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(IDENTIFY_DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw) as Record<string, unknown>;
        const parsedSpec = WatchSpecSchema.safeParse(draft.spec);
        if (!parsedSpec.success) {
          window.sessionStorage.removeItem(IDENTIFY_DRAFT_KEY);
          return;
        }

        const restoredImageUrl = safeStoredImageUrl(draft.imageUrl);
        setSpec(parsedSpec.data);
        setImageUrl(restoredImageUrl);
        setPreview(restoredImageUrl);
        setCached(Boolean(draft.cached));
        setHint(typeof draft.hint === "string" ? draft.hint.slice(0, 500) : "");
        setStatus(
          draft.status === "wishlist" || draft.status === "watching" ? draft.status : "owned"
        );
        setRecovered(true);
      } catch {
        window.sessionStorage.removeItem(IDENTIFY_DRAFT_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!spec) return;
    window.sessionStorage.setItem(
      IDENTIFY_DRAFT_KEY,
      JSON.stringify({ spec, imageUrl, cached, hint, status })
    );
  }, [cached, hint, imageUrl, spec, status]);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (!loading && !spec) return;

    allowLeaveRef.current = false;
    const identifyLocation = `${window.location.pathname}${window.location.search}`;
    const navigationWarning = loading
      ? "The watch analysis is still running and may still cost money. Leave this page anyway?"
      : UNSAVED_WARNING;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function linkNavigation(event: MouseEvent) {
      if (
        allowLeaveRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const clicked = event.target;
      if (!(clicked instanceof Element)) return;
      const link = clicked.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      const onlyHashChanges =
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search;
      if (destination.href === current.href || onlyHashChanges) return;

      if (window.confirm(navigationWarning)) {
        allowLeaveRef.current = true;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    function formNavigation(event: SubmitEvent) {
      if (allowLeaveRef.current || event.defaultPrevented) return;
      if (window.confirm(navigationWarning)) {
        allowLeaveRef.current = true;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }

    function backNavigation() {
      if (allowLeaveRef.current) return;
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        return;
      }

      const currentLocation = `${window.location.pathname}${window.location.search}`;
      if (currentLocation === identifyLocation) return;
      if (window.confirm(navigationWarning)) {
        allowLeaveRef.current = true;
        return;
      }

      restoringHistoryRef.current = true;
      window.history.forward();
    }

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", backNavigation);
    document.addEventListener("click", linkNavigation, true);
    document.addEventListener("submit", formNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", backNavigation);
      document.removeEventListener("click", linkNavigation, true);
      document.removeEventListener("submit", formNavigation, true);
    };
  }, [loading, spec]);

  function pickFile(f: File) {
    if (loading || saving) return;
    if (
      spec &&
      !window.confirm(
        "The current identification is not saved. Choose a different photo and discard this result?"
      )
    ) {
      return;
    }
    const requestId = ++requestIdRef.current;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSpec(null);
    setImageUrl(null);
    setCached(false);
    setRecovered(false);
    setError(null);
    window.sessionStorage.removeItem(IDENTIFY_DRAFT_KEY);

    // Pre-upload right away (no AI call) so the photo has a public URL — that
    // powers the free Google Lens pre-check before any tokens are spent. If
    // this fails, analyze() falls back to sending the file directly.
    setUploadName(null);
    setUploadedUrl(null);
    setUploading(true);
    void (async () => {
      try {
        const form = new FormData();
        form.append("image", f);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await res.json();
        if (requestId !== requestIdRef.current) return;
        if (res.ok) {
          setUploadName(typeof data.name === "string" ? data.name : null);
          setUploadedUrl(
            typeof data.lensUrl === "string" && data.lensUrl.startsWith("/api/uploads/") ? data.lensUrl : null
          );
        }
      } catch {
        /* pre-upload is best-effort — analyze() still works via the file */
      } finally {
        if (requestId === requestIdRef.current) setUploading(false);
      }
    })();
  }

  async function analyze() {
    if (!file || loading || saving) return;
    if (
      spec &&
      !window.confirm(
        "The current identification is not saved. Run another analysis and replace this result?"
      )
    ) {
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      // Prefer referencing the pre-uploaded photo (uploaded once, already on
      // disk); fall back to sending the file if the pre-upload didn't succeed.
      let res: Response;
      if (uploadName) {
        res = await fetch("/api/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: uploadName, hint: hint.trim() || undefined }),
        });
      } else {
        const form = new FormData();
        form.append("image", file);
        if (hint.trim()) form.append("hint", hint.trim());
        res = await fetch("/api/identify", { method: "POST", body: form });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Identification failed.");
      if (requestId !== requestIdRef.current) return;
      const savedImageUrl = safeStoredImageUrl(data.imageUrl);
      if (!savedImageUrl) throw new Error("Caliber returned an invalid saved-photo address.");
      setSpec(data.spec);
      setImageUrl(savedImageUrl);
      setCached(Boolean(data.cached));
      setRecovered(false);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  async function save() {
    if (!spec || saving || loading) return;
    setSaving(true);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...spec, status, imageUrl, specJson: JSON.stringify(spec) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      allowLeaveRef.current = true;
      window.sessionStorage.removeItem(IDENTIFY_DRAFT_KEY);
      router.replace(`/watch/${data.watch.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Identify a watch</h1>
        <p className="text-base text-muted mt-1 leading-relaxed">
          Upload a clear photo. Caliber recognizes the piece, confirms specs against real sources,
          and estimates its market value.
        </p>
      </div>
      <div className="rule" />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <UploadZone onFile={pickFile} preview={preview} disabled={loading || saving} />
          <LensButton imagePath={uploadedUrl} uploading={uploading} />
          <div className="card p-4 space-y-2">
            <label htmlFor="identification-hint" className="text-base font-semibold text-ink">
              Help Caliber identify it
              <span className="block text-[0.95rem] font-medium text-accent mt-0.5">
                Optional, but recommended
              </span>
            </label>
            <p className="text-base text-muted leading-relaxed">
              Add anything you know, such as the brand, model, reference number, or words on the
              caseback.
            </p>
            <textarea
              id="identification-hint"
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              disabled={loading || saving}
              rows={3}
              placeholder="Example: Breitling, Chronomat, A13356, or words engraved on the back"
              className="input resize-y"
            />
          </div>
          <button
            onClick={analyze}
            disabled={!file || loading || saving}
            className="btn btn-gold w-full"
          >
            {loading ? "Analyzing…" : "Analyze photo"}
          </button>
          {error && (
            <p className="text-danger text-base bg-danger/10 border border-danger/30 rounded-lg p-3">
              {error}
            </p>
          )}
        </div>

        <div className="card p-4 sm:p-6 min-h-64 min-w-0">
          {loading && (
            <div className="space-y-3">
              <div className="shimmer h-6 w-1/2 rounded bg-surface-2" />
              <div className="shimmer h-4 w-full rounded bg-surface-2" />
              <div className="shimmer h-4 w-2/3 rounded bg-surface-2" />
              <p className="text-muted text-base pt-2">Researching reference & market value…</p>
            </div>
          )}
          {!loading && !spec && (
            <div className="h-full flex items-center justify-center text-center text-muted text-base">
              Your spec sheet will appear here.
            </div>
          )}
          {spec && !loading && (
            <div className="space-y-5">
              {recovered && (
                <p className="text-good text-base bg-good/10 border border-good/30 rounded-lg p-3">
                  ✓ Your unsaved result was recovered — no new analysis was charged.
                </p>
              )}
              {cached && (
                <p className="text-good text-base bg-good/10 border border-good/30 rounded-lg p-3">
                  ✓ Loaded from a previous analysis of this exact photo — no new charge.
                </p>
              )}
              <SpecSheet spec={spec} />
              <div className="pt-2 border-t border-line/60 space-y-3">
                <p
                  role="status"
                  className="text-base text-warn bg-warn/10 border border-warn/30 rounded-lg p-3 leading-relaxed"
                >
                  Analysis ready, but it is not saved yet. Save this watch before leaving the page.
                </p>
                <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-2">
                  <label htmlFor="watch-status" className="text-[0.95rem] font-semibold text-muted">
                    Add to collection as
                  </label>
                  <select
                    id="watch-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={loading || saving}
                    className="input w-full min-[400px]:max-w-44"
                  >
                    <option value="owned">Owned</option>
                    <option value="wishlist">Wishlist</option>
                    <option value="watching">Watching</option>
                  </select>
                </div>
                <button
                  onClick={save}
                  disabled={saving || loading}
                  className="btn btn-gold w-full"
                >
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
