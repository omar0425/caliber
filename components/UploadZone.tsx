"use client";

import { useCallback, useRef, useState } from "react";
import { CameraIcon } from "./NavIcons";
import { isImageFile, prepareImageForUpload } from "@/lib/imagePrep";

export default function UploadZone({
  onFile,
  preview,
  hint = "Tap to choose a photo",
  disabled = false,
  primary = "camera",
  onError,
}: {
  onFile: (file: File) => void;
  // A photo that can't be prepared (e.g. HEIC on a browser that can't read
  // it) is reported here instead of failing later on the server.
  onError?: (message: string) => void;
  preview: string | null;
  hint?: string;
  disabled?: boolean;
  // Which button leads: the camera for a watch in hand, the library for a
  // listing screenshot. Once a photo is chosen neither competes with the
  // screen's main action (Analyze / Vet).
  primary?: "camera" | "library";
}) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preparing, setPreparing] = useState(false);

  // Shrink (and, where possible, convert) the photo on the device before it
  // is handed on for upload — see lib/imagePrep.ts.
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      // Some phone photo providers omit the MIME type. The server still
      // validates and decodes the actual bytes before any AI request.
      if (disabled || preparing || !file || !(!file.type || isImageFile(file))) return;
      setPreparing(true);
      try {
        onFile(await prepareImageForUpload(file));
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Couldn't read that photo. Try another one.");
      } finally {
        setPreparing(false);
      }
    },
    [disabled, preparing, onFile, onError]
  );
  const blocked = disabled || preparing;

  return (
    <div className="space-y-3">
      <div
        onClick={() => {
          if (!blocked) libraryRef.current?.click();
        }}
        aria-disabled={blocked}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!blocked) handleFiles(e.dataTransfer.files);
        }}
        className={`card card-hover overflow-hidden flex items-center justify-center text-center min-h-52 sm:min-h-64 ${
          blocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
        } ${
          drag ? "border-accent" : ""
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected watch" className="max-h-80 sm:max-h-96 w-full object-contain" />
        ) : (
          <div className="p-5 sm:p-8">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full border border-accent/60 flex items-center justify-center text-accent text-2xl">
              +
            </div>
            <p className="text-ink text-lg font-semibold">{preparing ? "Preparing photo…" : hint}</p>
            <p className="text-muted mt-1">Clear, well-lit shots work best</p>
          </div>
        )}
      </div>

      {/* Camera-first on phones; both buttons work everywhere */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={blocked}
          className={`btn w-full ${!preview && primary === "camera" ? "btn-gold" : "btn-ghost"} ${primary === "library" ? "min-[400px]:order-2" : ""}`}
        >
          <CameraIcon className="w-5 h-5" /> {preview ? "Retake" : "Take photo"}
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          disabled={blocked}
          className={`btn w-full ${!preview && primary === "library" ? "btn-gold" : "btn-ghost"} ${primary === "library" ? "order-first min-[400px]:order-1" : ""}`}
        >
          {preview ? "Choose another" : "Choose photo"}
        </button>
      </div>

      {/* Library picker (no capture → gallery/files) */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        disabled={blocked}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Camera capture (rear camera on phones) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={blocked}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
