"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/UploadZone";
import SpecSheet from "@/components/SpecSheet";
import LensButton from "@/components/LensButton";
import { NoticeBanner } from "@/components/states";
import StickyActions from "@/components/StickyActions";
import DuplicateWarning, { duplicateQuery } from "@/components/DuplicateWarning";
import AnalysisProgress from "@/components/AnalysisProgress";
import { WatchSpec, WatchSpecSchema } from "@/lib/types";
import { safeStoredImageUrl } from "@/lib/uploadUrl";
import type { DuplicateMatch } from "@/lib/duplicates";
import { ApiError, errorMessage, fetchJson } from "@/lib/fetchJson";


const UNSAVED_WARNING =
  "This identification has not been saved. If you leave, the result will be lost and another analysis may cost money. Leave without saving?";
const IDENTIFY_DRAFT_KEY = "caliber:identify-draft:v1";
// The identify route allows 120s; give the network a little more before
// telling the collector it timed out.
const ANALYSIS_TIMEOUT_MS = 150_000;

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
  const [duplicateCheck, setDuplicateCheck] = useState<{ spec: WatchSpec; matches: DuplicateMatch[] } | null>(null);
  const duplicates = spec && duplicateCheck?.spec === spec ? duplicateCheck.matches : [];
  const allowLeaveRef = useRef(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
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

  // Warn before the same watch is added twice (same photo, same reference, or
  // a near-identical title). Best-effort: a failed check never blocks saving.
  useEffect(() => {
    if (!spec) return;
    let cancelled = false;
    fetchJson<{ matches?: DuplicateMatch[] }>(duplicateQuery({ ...spec, imageUrl }))
      .then((data) => {
        if (!cancelled) setDuplicateCheck({ spec, matches: data.matches ?? [] });
      })
      .catch(() => {
        if (!cancelled) setDuplicateCheck({ spec, matches: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [spec, imageUrl]);

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
        const data = await fetchJson<{ name?: unknown; lensUrl?: unknown }>("/api/uploads", {
          method: "POST",
          body: form,
        });
        if (requestId !== requestIdRef.current) return;
        setUploadName(typeof data.name === "string" ? data.name : null);
        setUploadedUrl(
          typeof data.lensUrl === "string" && data.lensUrl.startsWith("/api/uploads/") ? data.lensUrl : null
        );
      } catch (e) {
        // A photo the server rejects (wrong format, too large) won't analyze
        // either — say so now rather than after the collector taps Analyze.
        // A network blip is still recoverable: analyze() resends the file.
        if (requestId === requestIdRef.current && e instanceof ApiError && e.status >= 400) {
          setError(e.message);
        }
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
    revealResult();
    try {
      // Prefer referencing the pre-uploaded photo (uploaded once, already on
      // disk); fall back to sending the file if the pre-upload didn't succeed.
      type IdentifyResponse = { spec: WatchSpec; imageUrl?: unknown; cached?: boolean };
      let data: IdentifyResponse;
      if (uploadName) {
        data = await fetchJson<IdentifyResponse>("/api/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: uploadName, hint: hint.trim() || undefined }),
          timeoutMs: ANALYSIS_TIMEOUT_MS,
        });
      } else {
        const form = new FormData();
        form.append("image", file);
        if (hint.trim()) form.append("hint", hint.trim());
        data = await fetchJson<IdentifyResponse>("/api/identify", {
          method: "POST",
          body: form,
          timeoutMs: ANALYSIS_TIMEOUT_MS,
        });
      }
      if (requestId !== requestIdRef.current) return;
      const savedImageUrl = safeStoredImageUrl(data.imageUrl);
      if (!savedImageUrl) throw new Error("Caliber returned an invalid saved-photo address.");
      setSpec(data.spec);
      setImageUrl(savedImageUrl);
      setCached(Boolean(data.cached));
      setRecovered(false);
      revealResult();
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(e, "Something went wrong."));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  // On a phone the result renders below the photo and hint; bring it into view
  // when an analysis starts and when it finishes, instead of leaving the
  // collector looking at an unchanged screen for half a minute.
  function revealResult() {
    window.setTimeout(() => {
      if (!window.matchMedia("(max-width: 1023px)").matches) return;
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  async function save() {
    if (!spec || saving || loading) return;
    setSaving(true);
    try {
      const data = await fetchJson<{ watch: { id: string } }>("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...spec, status, imageUrl, specJson: JSON.stringify(spec) }),
      });
      allowLeaveRef.current = true;
      window.sessionStorage.removeItem(IDENTIFY_DRAFT_KEY);
      router.replace(`/watch/${data.watch.id}`);
    } catch (e) {
      setError(errorMessage(e, "Failed to save."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Identify a watch</h1>
        <p className="text-muted mt-1 leading-relaxed">
          Upload a clear photo. Caliber recognizes the piece, confirms specs against real sources,
          and estimates its market value.
        </p>
      </div>
      <div className="rule" />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <UploadZone onFile={pickFile} onError={setError} preview={preview} disabled={loading || saving} />
          <LensButton name={uploadName} imagePath={uploadedUrl} uploading={uploading} />
          <div className="card p-4 space-y-2">
            <label htmlFor="identification-hint" className="font-semibold text-ink">
              Help Caliber identify it
              <span className="block text-[0.95rem] font-medium text-accent mt-0.5">
                Optional, but recommended
              </span>
            </label>
            <p className="text-muted leading-relaxed">
              Add anything you know, such as the brand, model, reference number, or words on the
              caseback.
            </p>
            <textarea
              id="identification-hint"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              disabled={loading || saving}
              rows={3}
              placeholder="Example: Breitling, Chronomat, A13356, or words engraved on the back"
              className="input resize-y"
            />
          </div>
          {error && <NoticeBanner tone="danger">{error}</NoticeBanner>}
          <p className="text-[15px] leading-relaxed text-muted">
            Know the details already, or no photo handy?{" "}
            <Link href="/add" className="font-medium text-accent underline-offset-2 hover:underline">
              Add it manually
            </Link>{" "}
            — no AI, no cost.
          </p>
          {file && !spec ? (
            <StickyActions>
              <button onClick={analyze} disabled={loading || saving || uploading} className="btn btn-gold w-full">
                {loading ? "Analyzing…" : uploading ? "Uploading photo…" : "Analyze photo"}
              </button>
            </StickyActions>
          ) : (
            <button
              onClick={analyze}
              disabled={!file || loading || saving}
              className={`btn w-full ${spec ? "btn-ghost" : "btn-gold"}`}
            >
              {loading ? "Analyzing…" : spec ? "Analyze again" : "Analyze photo"}
            </button>
          )}
        </div>

        <div ref={resultRef} className="card p-4 sm:p-6 min-h-64 min-w-0 scroll-mt-6 lg:scroll-mt-24">
          {loading && <AnalysisProgress label="Researching reference & market value…" />}
          {!loading && !spec && (
            <div className="h-full flex items-center justify-center text-center text-muted">
              Your spec sheet will appear here.
            </div>
          )}
          {spec && !loading && (
            <div className="space-y-5">
              {recovered && (
                <NoticeBanner tone="good">
                  ✓ Your unsaved result was recovered — no new analysis was charged.
                </NoticeBanner>
              )}
              {cached && (
                <NoticeBanner tone="good">
                  ✓ Loaded from a previous analysis of this exact photo — no new charge.
                </NoticeBanner>
              )}
              <NoticeBanner tone="warn" role="status">
                Analysis ready, but it is not saved yet. Save this watch before leaving the page.
              </NoticeBanner>
              <DuplicateWarning
                matches={duplicates}
                currentName={`${spec.brand} ${spec.model}`}
                onAdoptName={(match) =>
                  setSpec((current) => (current ? { ...current, brand: match.brand, model: match.model } : current))
                }
              />
              <SpecSheet spec={spec} />
              <StickyActions>
                {/* One row on a phone so the pinned bar stays short. */}
                <div className="flex items-center gap-2">
                  <label htmlFor="watch-status" className="sr-only">
                    Add to collection as
                  </label>
                  <select
                    id="watch-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={loading || saving}
                    className="input w-auto shrink-0"
                  >
                    <option value="owned">Owned</option>
                    <option value="wishlist">Wishlist</option>
                    <option value="watching">Watching</option>
                  </select>
                  <button onClick={save} disabled={saving || loading} className="btn btn-gold min-w-0 flex-1">
                    {saving ? "Saving…" : duplicates.length > 0 ? "Save anyway" : "Save to collection"}
                  </button>
                </div>
              </StickyActions>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
