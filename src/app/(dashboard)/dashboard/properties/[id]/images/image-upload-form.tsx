"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { createMainAndThumbnailImages } from "@/lib/images/client-image-processing";
import {
  requestProcessedPropertyImageUpload,
  finalizePropertyImageUpload,
} from "./actions";

const ACCEPTED = "image/jpeg,image/png,image/webp";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
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
    if (!ALLOWED.includes(picked.type)) {
      setError("Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.");
      e.target.value = "";
      setFile(null);
      setPreview(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(
        `Ảnh quá lớn (${(picked.size / 1024 / 1024).toFixed(1)} MB). Tối đa ${MAX_MB} MB.`
      );
      e.target.value = "";
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  // A friendly CORS/network error shared by both direct-to-R2 PUTs.
  const CORS_ERROR =
    "Không tải được ảnh lên R2. Nhiều khả năng bucket chưa cho phép CORS từ địa chỉ hiện tại. " +
    "Hãy thêm origin này vào cấu hình CORS của bucket R2 rồi thử lại.";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || isPending) return;

    setError(null);
    setIsPending(true);

    try {
      // 1. Resize/compress on the client → social-ready main + small thumbnail.
      setStatusMsg("Đang xử lý ảnh…");
      let processed;
      try {
        processed = await createMainAndThumbnailImages(file);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Không xử lý được ảnh. Vui lòng thử ảnh khác."
        );
        setStatusMsg(null);
        setIsPending(false);
        return;
      }
      const { main, thumbnail } = processed;

      // 2. Ask the server for presigned R2 upload targets for both files.
      const req = await requestProcessedPropertyImageUpload(propertyId, {
        fileName: main.file.name,
        width: main.width,
        height: main.height,
        original: { mimeType: main.mimeType, sizeBytes: main.sizeBytes },
        thumbnail: {
          mimeType: thumbnail.mimeType,
          sizeBytes: thumbnail.sizeBytes,
        },
      });
      if (!req.ok) {
        setError(req.error);
        setStatusMsg(null);
        setIsPending(false);
        return;
      }

      // 3. Upload the main image straight to R2. A thrown error here is almost
      //    always a CORS/network failure (the bucket must allow this origin).
      setStatusMsg("Đang tải ảnh lên…");
      let mainRes: Response;
      try {
        mainRes = await fetch(req.originalUploadUrl, {
          method: "PUT",
          body: main.file,
          headers: { "Content-Type": req.originalContentType },
        });
      } catch {
        setError(CORS_ERROR);
        setStatusMsg(null);
        setIsPending(false);
        return;
      }
      if (!mainRes.ok) {
        setError(
          `Tải ảnh lên R2 thất bại (mã ${mainRes.status}). Vui lòng thử lại.`
        );
        setStatusMsg(null);
        setIsPending(false);
        return;
      }

      // 4. Upload the thumbnail. If this fails after the main upload, we leave
      //    the row pending (not finalized) so it stays hidden from the UI —
      //    no broken image is ever shown.
      let thumbRes: Response;
      try {
        thumbRes = await fetch(req.thumbnailUploadUrl, {
          method: "PUT",
          body: thumbnail.file,
          headers: { "Content-Type": req.thumbnailContentType },
        });
      } catch {
        setError(CORS_ERROR);
        setStatusMsg(null);
        setIsPending(false);
        return;
      }
      if (!thumbRes.ok) {
        setError(
          `Tải ảnh thu nhỏ lên R2 thất bại (mã ${thumbRes.status}). Vui lòng thử lại.`
        );
        setStatusMsg(null);
        setIsPending(false);
        return;
      }

      // 5. Mark the row ready.
      const fin = await finalizePropertyImageUpload(propertyId, req.imageId);
      if (!fin.ok) {
        setError(fin.error);
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
