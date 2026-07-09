"use client";

import { useCallback, useRef, useState } from "react";
import { CameraIcon } from "./NavIcons";

export default function UploadZone({
  onFile,
  preview,
  hint = "Tap to choose a photo",
}: {
  onFile: (file: File) => void;
  preview: string | null;
  hint?: string;
}) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file && file.type.startsWith("image/")) onFile(file);
    },
    [onFile]
  );

  return (
    <div className="space-y-3">
      <div
        onClick={() => libraryRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`card card-hover cursor-pointer overflow-hidden flex items-center justify-center text-center min-h-56 sm:min-h-64 ${
          drag ? "border-accent!" : ""
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected watch" className="max-h-80 sm:max-h-96 w-full object-contain" />
        ) : (
          <div className="p-8">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full border border-accent/60 flex items-center justify-center text-accent text-2xl">
              +
            </div>
            <p className="text-ink font-medium">{hint}</p>
            <p className="text-muted text-sm mt-1">Clear, well-lit shots work best</p>
          </div>
        )}
      </div>

      {/* Camera-first on phones; both buttons work everywhere */}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => cameraRef.current?.click()} className="btn btn-gold">
          <CameraIcon className="w-5 h-5" /> Take photo
        </button>
        <button type="button" onClick={() => libraryRef.current?.click()} className="btn btn-ghost">
          Choose photo
        </button>
      </div>

      {/* Library picker (no capture → gallery/files) */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {/* Camera capture (rear camera on phones) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
