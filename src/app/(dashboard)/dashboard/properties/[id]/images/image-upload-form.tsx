"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import {
  requestPropertyImageUpload,
  finalizePropertyImageUpload,
} from "./actions";

const ACCEPTED = "image/jpeg,image/png,image/webp";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 2;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || isPending) return;

    setError(null);
    setIsPending(true);

    try {
      // 1. Ask the server for a presigned R2 upload target.
      const req = await requestPropertyImageUpload(propertyId, {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!req.ok) {
        setError(req.error);
        setIsPending(false);
        return;
      }

      // 2. Upload bytes straight to R2. A thrown error here is almost always a
      //    CORS/network failure (the bucket must allow this origin).
      let putRes: Response;
      try {
        putRes = await fetch(req.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": req.contentType },
        });
      } catch {
        setError(
          "Không tải được ảnh lên R2. Nhiều khả năng bucket chưa cho phép CORS từ địa chỉ hiện tại. " +
            "Hãy thêm origin này vào cấu hình CORS của bucket R2 rồi thử lại."
        );
        setIsPending(false);
        return;
      }
      if (!putRes.ok) {
        setError(`Tải ảnh lên R2 thất bại (mã ${putRes.status}). Vui lòng thử lại.`);
        setIsPending(false);
        return;
      }

      // 3. Mark the row ready.
      const fin = await finalizePropertyImageUpload(propertyId, req.imageId);
      if (!fin.ok) {
        setError(fin.error);
        setIsPending(false);
        return;
      }

      // Success — refresh server data, then remount this form fresh.
      router.refresh();
      onSuccess();
    } catch {
      setError("Lỗi không xác định khi tải ảnh lên. Vui lòng thử lại.");
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
        {isPending ? "Đang tải lên…" : "Tải ảnh lên"}
      </Button>
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
