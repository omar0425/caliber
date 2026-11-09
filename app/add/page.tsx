"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/UploadZone";
import StickyActions from "@/components/StickyActions";
import DuplicateWarning, { duplicateQuery } from "@/components/DuplicateWarning";
import { NoticeBanner } from "@/components/states";
import type { DuplicateMatch } from "@/lib/duplicates";
import { errorMessage, fetchJson } from "@/lib/fetchJson";
import { MONEY_HINT, parseMoney } from "@/lib/money";

// Add a watch without AI: for when the collector already knows what it is,
// has no photo handy, or AI analysis is paused / over budget. A photo is
// optional and can be identified later from the watch page.
export default function AddWatchPage() {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState("owned");
  const [condition, setCondition] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [foundDuplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const hasIdentity = Boolean(brand.trim() || model.trim() || referenceNumber.trim() || imageUrl);
  const duplicates = hasIdentity ? foundDuplicates : [];

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Check for the same watch as the collector types (debounced).
  useEffect(() => {
    if (!hasIdentity) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchJson<{ matches?: DuplicateMatch[] }>(duplicateQuery({ brand, model, referenceNumber, imageUrl }))
        .then((data) => {
          if (!cancelled) setDuplicates(data.matches ?? []);
        })
        .catch(() => {
          if (!cancelled) setDuplicates([]);
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [brand, model, referenceNumber, imageUrl, hasIdentity]);

  async function pickFile(file: File) {
    setPreview(URL.createObjectURL(file));
    setImageUrl(null);
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const data = await fetchJson<{ imageUrl?: unknown }>("/api/uploads", { method: "POST", body: form });
      setImageUrl(typeof data.imageUrl === "string" ? data.imageUrl : null);
    } catch (e) {
      setError(errorMessage(e, "The photo couldn't be uploaded."));
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (saving || uploading) return;
    setError(null);
    if (!brand.trim() || !model.trim()) {
      setError("Brand and model are required.");
      return;
    }
    const price = parseMoney(purchasePrice);
    if (Number.isNaN(price)) {
      setPriceError(MONEY_HINT);
      return;
    }
    setSaving(true);
    try {
      const data = await fetchJson<{ watch: { id: string } }>("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          model: model.trim(),
          referenceNumber: referenceNumber.trim() || null,
          nickname: nickname.trim() || null,
          status,
          condition: condition.trim() || null,
          purchasePrice: price,
          purchaseDate: purchaseDate || null,
          notes: notes.trim() || null,
          imageUrl,
        }),
      });
      router.replace(`/watch/${data.watch.id}`);
    } catch (e) {
      setError(errorMessage(e, "Could not save this watch."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Add a watch manually</h1>
        <p className="mt-1 leading-relaxed text-muted">
          No AI, no cost. You can identify it from a photo later on the watch&apos;s page, or{" "}
          <Link href="/identify" className="font-medium text-accent hover:underline">
            identify it from a photo now
          </Link>
          .
        </p>
      </div>
      <div className="rule" />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="font-semibold text-ink">Photo (optional)</p>
          <UploadZone onFile={pickFile} onError={setError} preview={preview} disabled={saving} />
          {uploading && <p className="text-sm text-muted">Uploading photo…</p>}
        </div>

        <div className="card space-y-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="add-brand" label="Brand *">
              <input id="add-brand" value={brand} onChange={(e) => setBrand(e.target.value)} autoCapitalize="words" autoCorrect="off" spellCheck={false} className="input mt-1 min-h-12" />
            </Field>
            <Field id="add-model" label="Model *">
              <input id="add-model" value={model} onChange={(e) => setModel(e.target.value)} autoCorrect="off" spellCheck={false} className="input mt-1 min-h-12" />
            </Field>
            <Field id="add-ref" label="Reference">
              <input id="add-ref" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="input mt-1 min-h-12" />
            </Field>
            <Field id="add-nickname" label="Nickname">
              <input id="add-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="input mt-1 min-h-12" />
            </Field>
            <Field id="add-status" label="Status">
              <select id="add-status" value={status} onChange={(e) => setStatus(e.target.value)} className="input mt-1 min-h-12">
                <option value="owned">Owned</option>
                <option value="wishlist">Wishlist</option>
                <option value="watching">Watching</option>
              </select>
            </Field>
            <Field id="add-condition" label="Condition">
              <input id="add-condition" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Mint, full set" className="input mt-1 min-h-12" />
            </Field>
            <Field id="add-price" label="Purchase price (USD)">
              <input
                id="add-price"
                value={purchasePrice}
                onChange={(e) => {
                  setPurchasePrice(e.target.value);
                  setPriceError(null);
                }}
                inputMode="decimal"
                placeholder="e.g. 8,500"
                aria-invalid={priceError ? true : undefined}
                className="input mt-1 min-h-12"
              />
              {priceError && <p className="mt-1.5 text-[15px] text-danger">{priceError}</p>}
            </Field>
            <Field id="add-purchase-date" label="Purchase date">
              <input id="add-purchase-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="input mt-1 min-h-12" />
            </Field>
          </div>
          <Field id="add-notes" label="Notes">
            <textarea id="add-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Service history, provenance, box & papers…" className="input mt-1 resize-y" />
          </Field>

          <DuplicateWarning matches={duplicates} />
          {error && <NoticeBanner tone="danger" role="alert">{error}</NoticeBanner>}

          <StickyActions>
            <button onClick={save} disabled={saving || uploading || !brand.trim() || !model.trim()} className="btn btn-gold w-full">
              {saving ? "Saving…" : uploading ? "Uploading photo…" : duplicates.length ? "Save anyway" : "Save to collection"}
            </button>
          </StickyActions>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label text-sm">
        {label}
      </label>
      {children}
    </div>
  );
}
