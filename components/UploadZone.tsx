"use client";

import { useCallback, useRef, useState } from "react";
import { CameraIcon } from "./NavIcons";

export default function UploadZone({
  onFile,
  preview,
  hint = "Tap to choose a photo",
  disabled = false,
}: {
  onFile: (file: File) => void;
  preview: string | null;
  hint?: string;
  disabled?: boolean;
}) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      // Some phone photo providers omit the MIME type. The server still
      // validates and decodes the actual bytes before any AI request.
      if (!disabled && file && (!file.type || file.type.startsWith("image/"))) onFile(file);
    },
    [disabled, onFile]
  );

  return (
    <div className="space-y-3">
      <div
        onClick={() => {
          if (!disabled) libraryRef.current?.click();
        }}
        aria-disabled={disabled}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        className={`card card-hover overflow-hidden flex items-center justify-center text-center min-h-52 sm:min-h-64 ${
          disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
        } ${
          drag ? "border-accent!" : ""
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
            <p className="text-ink text-lg font-semibold">{hint}</p>
            <p className="text-muted text-base mt-1">Clear, well-lit shots work best</p>
          </div>
        )}
      </div>

      {/* Camera-first on phones; both buttons work everywhere */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled}
          className="btn btn-gold w-full"
        >
          <CameraIcon className="w-5 h-5" /> Take photo
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          disabled={disabled}
          className="btn btn-ghost w-full"
        >
          Choose photo
        </button>
      </div>

      {/* Library picker (no capture → gallery/files) */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        disabled={disabled}
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
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
