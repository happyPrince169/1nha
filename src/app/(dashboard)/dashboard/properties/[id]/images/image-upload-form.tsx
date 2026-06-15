"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { uploadPropertyImage, type ImageActionState } from "./actions";

const INITIAL_STATE: ImageActionState = { error: null };
const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_MB = 2;
const MAX_BYTES = MAX_MB * 1024 * 1024;

type Props = { propertyId: string };

// ---------------------------------------------------------------------------
// Inner form — remounted via `key` after a successful upload so that all
// uncontrolled inputs (file input, preview URL) reset without violating
// React's rules around refs and setState-in-effect.
// ---------------------------------------------------------------------------
function UploadFormInner({
  propertyId,
  onSuccess,
}: {
  propertyId: string;
  onSuccess: () => void;
}) {
  const boundAction = uploadPropertyImage.bind(null, propertyId);

  async function wrappedAction(
    prev: ImageActionState,
    formData: FormData
  ): Promise<ImageActionState> {
    const result = await boundAction(prev, formData);
    if (!result.error) onSuccess();
    return result;
  }

  const [state, formAction, isPending] = useActionState(
    wrappedAction,
    INITIAL_STATE
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setClientError("Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.");
      e.target.value = "";
      setPreview(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setClientError(
        `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa ${MAX_MB} MB.`
      );
      e.target.value = "";
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  const displayError = clientError ?? state.error;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {displayError && <FormError>{displayError}</FormError>}

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
            setPreview(null);
            setClientError(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Xoá ảnh đã chọn
        </button>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isPending || !preview || !!clientError}
      >
        {isPending ? "Đang tải lên…" : "Tải ảnh lên"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Public export — shell that resets the inner form after each successful
// upload by incrementing a `key`, causing UploadFormInner to remount fresh.
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
