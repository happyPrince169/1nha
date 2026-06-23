"use client";

import { useEffect, useRef, useState } from "react";

import { FormError } from "@/components/ui/form-error";
import {
  isProbablyImageFile,
  MAX_INPUT_BYTES,
  ERR_NOT_IMAGE,
  ERR_GALLERY_TOO_LARGE,
} from "@/lib/images/client-image-processing";

// "image/*" so phone cameras/galleries (incl. HEIC and empty-MIME JPEGs) can be
// selected; the real decode/format validation happens at upload time via
// createMainAndThumbnailImages, exactly like the gallery upload.
const ACCEPTED = "image/*";
const MAX_MB = Math.round(MAX_INPUT_BYTES / (1024 * 1024));

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type Props = {
  /** Notified with the full File[] whenever the selection changes. */
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

function makeId(): string {
  // crypto.randomUUID is available in all browsers that run this app.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// ---------------------------------------------------------------------------
// PropertyImagePicker — optional, mobile-first multi-image selection.
//
// Self-contained: it owns the selected files + their preview object URLs,
// validates each pick cheaply (plausibly-an-image + size), shows previews, and
// lets the user remove images before submit. It does NOT upload — the parent
// orchestrates create-then-upload via uploadPropertyImagesToR2 so the same
// direct-to-R2 architecture is preserved. The parent only receives File[].
// ---------------------------------------------------------------------------
export function PropertyImagePicker({ onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Revoke any outstanding object URLs when the component unmounts. The ref is
  // kept in sync via an effect (mutating a ref during render is disallowed).
  const imagesRef = useRef<SelectedImage[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.previewUrl);
    };
  }, []);

  function commit(next: SelectedImage[]) {
    setImages(next);
    onChange(next.map((i) => i.file));
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    // Reset the input so the same file can be re-selected after removal.
    e.target.value = "";
    if (picked.length === 0) return;

    const accepted: SelectedImage[] = [];
    let rejectedNonImage = false;
    let rejectedTooLarge = false;

    for (const file of picked) {
      if (!isProbablyImageFile(file)) {
        rejectedNonImage = true;
        continue;
      }
      if (file.size > MAX_INPUT_BYTES) {
        rejectedTooLarge = true;
        continue;
      }
      accepted.push({
        id: makeId(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (rejectedNonImage) setError(ERR_NOT_IMAGE);
    else if (rejectedTooLarge) setError(ERR_GALLERY_TOO_LARGE);

    if (accepted.length > 0) commit([...images, ...accepted]);
  }

  function handleRemove(id: string) {
    const target = images.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    commit(images.filter((i) => i.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <FormError>{error}</FormError>}

      {/* Drop zone / picker trigger */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled)
            inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Chọn ảnh căn nhà"
        className={[
          "flex min-h-[120px] cursor-pointer flex-col items-center justify-center",
          "rounded-xl border-2 border-dashed transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          disabled
            ? "cursor-not-allowed border-border opacity-50"
            : "border-border hover:border-primary/60 hover:bg-muted/40",
        ].join(" ")}
      >
        <div className="flex flex-col items-center gap-2 p-5 text-center text-muted-foreground">
          <span className="text-3xl leading-none" aria-hidden>
            📷
          </span>
          <p className="text-sm font-medium">Chọn ảnh</p>
          <p className="text-xs">JPEG · PNG · WebP · tối đa {MAX_MB} MB mỗi ảnh</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        disabled={disabled}
        onChange={handleFilesSelected}
        className="sr-only"
      />

      {/* Previews */}
      {images.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            Đã chọn {images.length} ảnh
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img) => (
              <div
                key={img.id}
                className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt="Ảnh đã chọn"
                  className="h-full w-full object-cover"
                />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(img.id)}
                    aria-label="Xoá ảnh này"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
