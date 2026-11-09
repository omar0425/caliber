// Saves an export (backup JSON, CSV) without navigating away. A plain link to
// a file download strands the installed iPhone app on a file page with no Back
// button; instead fetch it, then hand it to the share sheet ("Save to Files",
// AirDrop, Mail) on phones, or trigger a normal download elsewhere.
import { ApiError } from "./fetchJson";

export async function saveExport(url: string, fallbackName: string): Promise<"shared" | "downloaded" | "cancelled"> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError("Couldn't reach Caliber. Check your connection and try again.", 0);
  }
  if (!res.ok) throw new ApiError("The export failed. Please try again.", res.status);

  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const blob = await res.blob();
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });

  const touch = window.matchMedia("(hover: none)").matches;
  if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Share unavailable for this file type — fall through to a download.
    }
  }

  const href = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return "downloaded";
}

// For the full backup ZIP (often 50–100 MB): in a normal browser tab, let the
// browser stream it straight to disk instead of holding it in memory. Only the
// installed iPhone app — which a plain download link would strand — goes
// through the share sheet.
export async function downloadLargeExport(url: string, fallbackName: string): Promise<"shared" | "downloaded" | "cancelled"> {
  if (window.matchMedia("(display-mode: standalone)").matches) return saveExport(url, fallbackName);
  const link = document.createElement("a");
  link.href = url;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return "downloaded";
}
