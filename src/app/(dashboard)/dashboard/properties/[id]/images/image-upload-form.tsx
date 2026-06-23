"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import {
  isProbablyImageFile,
  ERR_NOT_IMAGE,
  ERR_GALLERY_TOO_LARGE,
} from "@/lib/images/client-image-processing";
import { uploadProcessedPropertyImage } from "@/lib/images/upload-property-images";
import {
  requestProcessedPropertyImageUpload,
  finalizePropertyImageUpload,
} from "./actions";

// "image/*" so phone cameras/galleries (incl. HEIC and empty-MIME JPEGs) can be
// selected; createMainAndThumbnailImages validates + converts robustly.
const ACCEPTED = "image/*";
// Raw selection limit — the browser resizes/compresses down to a social-ready
// main image + small thumbnail before anything is uploaded.
const MAX_MB = 20;
const MAX_BYTES = MAX_MB * 1024 * 1024;

type Props = { propertyId: string };

// ---------------------------------------------------------------------------
// Inner form — remounted via `key` after a successful upload so the file input
// and preview reset cleanly. Uploads go directly to Cloudflare R2:
//   1. requestPropertyImageUpload  → presigned PUT URL + pending metadata row
//   2. fetch(uploadUrl, { method: "PUT", body: file })  → bytes go to R2
//   3. finalizePropertyImageUpload → marks the row ready
// Bytes never travel through a Server Action.
// ---------------------------------------------------------------------------
function UploadFormInner({
  propertyId,
  onSuccess,
}: {
  propertyId: string;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = e.target.files?.[0];
    if (!picked) {
      setFile(null);
      setPreview(null);
      return;
    }
    // Accept anything plausibly an image (by MIME or extension); the real
    // decode/format validation happens in createMainAndThumbnailImages so a
    // valid .jpg with an empty/odd MIME type is never rejected here.
    if (!isProbablyImageFile(picked)) {
      setError(ERR_NOT_IMAGE);
      e.target.value = "";
      setFile(null);
      setPreview(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(ERR_GALLERY_TOO_LARGE);
      e.target.value = "";
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || isPending) return;

    setError(null);
    setIsPending(true);
    setStatusMsg("Đang xử lý ảnh…");

    try {
      // Process → presign → direct-to-R2 PUT (main + thumbnail) → finalize.
      // The shared helper keeps this identical to the create-with-images flow;
      // bytes never travel through a Server Action.
      const res = await uploadProcessedPropertyImage(
        propertyId,
        file,
        {
          requestTargets: requestProcessedPropertyImageUpload,
          finalize: finalizePropertyImageUpload,
        },
        (phase) =>
          setStatusMsg(
            phase === "processing" ? "Đang xử lý ảnh…" : "Đang tải ảnh lên…"
          )
      );
      if (!res.ok) {
        setError(res.error);
        setStatusMsg(null);
        setIsPending(false);
        return;
      }

      // Success — refresh server data, then remount this form fresh.
      setStatusMsg("Hoàn tất");
      router.refresh();
      onSuccess();
    } catch {
      setError("Lỗi không xác định khi tải ảnh lên. Vui lòng thử lại.");
      setStatusMsg(null);
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <FormError>{error}</FormError>}

      {/* Drop zone */}
      <div
        onClick={() => !isPending && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isPending)
            inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Chọn ảnh để tải lên"
        className={[
          "flex min-h-[140px] cursor-pointer flex-col items-center justify-center",
          "rounded-xl border-2 border-dashed transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          isPending
            ? "cursor-not-allowed border-border opacity-50"
            : "border-border hover:border-primary/60 hover:bg-muted/40",
        ].join(" ")}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Xem trước"
            className="max-h-48 w-full rounded-lg object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-5 text-center text-muted-foreground">
            <span className="text-3xl leading-none" aria-hidden>
              📷
            </span>
            <p className="text-sm font-medium">Nhấn để chọn ảnh</p>
            <p className="text-xs">JPEG · PNG · WebP · tối đa {MAX_MB} MB</p>
            <p className="text-[11px]">
              Ảnh được tối ưu ngay trên máy trước khi tải lên.
            </p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        id="image"
        name="image"
        type="file"
        accept={ACCEPTED}
        disabled={isPending}
        onChange={handleFileChange}
        className="sr-only"
      />

      {preview && !isPending && (
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setPreview(null);
            setError(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Xoá ảnh đã chọn
        </button>
      )}

      <Button type="submit" className="w-full" disabled={isPending || !file}>
        {isPending ? (statusMsg ?? "Đang tải lên…") : "Tải ảnh lên"}
      </Button>

      {isPending && statusMsg && (
        <p
          className="text-center text-xs text-muted-foreground"
          aria-live="polite"
        >
          {statusMsg}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Public export — remounts the inner form after each successful upload by
// bumping a `key`, resetting all uncontrolled state.
// ---------------------------------------------------------------------------
export function ImageUploadForm({ propertyId }: Props) {
  const [uploadKey, setUploadKey] = useState(0);
  return (
    <UploadFormInner
      key={uploadKey}
      propertyId={propertyId}
      onSuccess={() => setUploadKey((k) => k + 1)}
    />
  );
}
