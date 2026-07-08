"use client";

import { useCallback, useRef, useState } from "react";

export default function UploadZone({
  onFile,
  preview,
  hint = "Drop a watch photo, or click to browse",
}: {
  onFile: (file: File) => void;
  preview: string | null;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file && file.type.startsWith("image/")) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onClick={() => inputRef.current?.click()}
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
      className={`card card-hover cursor-pointer overflow-hidden flex items-center justify-center text-center min-h-64 ${
        drag ? "border-accent!" : ""
      }`}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected watch" className="max-h-96 w-full object-contain" />
      ) : (
        <div className="p-10">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full border border-accent/60 flex items-center justify-center text-accent text-2xl">
            +
          </div>
          <p className="text-ink font-medium">{hint}</p>
          <p className="text-muted text-sm mt-1">JPEG, PNG, or WebP · clear, well-lit shots work best</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
