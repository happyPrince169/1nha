"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PickerImage = {
  id: string;
  signedUrl: string;
  altText: string | null;
  caption: string | null;
  isCover: boolean;
};

type ActionStatus = "idle" | "busy" | "ok" | "error";

type ImageState = {
  status: ActionStatus;
  message: string;
};

type Props = {
  images: PickerImage[];
  propertyId: string;
};

// ---------------------------------------------------------------------------
// File-naming helpers
// ---------------------------------------------------------------------------
function inferExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg"; // image/jpeg + fallback
}

function buildFilename(imageId: string, mimeType: string): string {
  return `1nha-${imageId}.${inferExtension(mimeType)}`;
}

// ---------------------------------------------------------------------------
// downloadImage
//
// Fetches the signed URL as a Blob so the browser treats it as a same-origin
// resource, constructs a temporary object URL, and triggers a synthetic <a>
// click. Revokes the object URL immediately after.
// Throws on network or fetch errors.
// ---------------------------------------------------------------------------
async function downloadImage(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Tải ảnh thất bại (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // Revoke after a short delay to ensure the browser has time to start the
    // download before the object URL is invalidated.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}

// ---------------------------------------------------------------------------
// copyImageToClipboard
//
// Uses the async Clipboard API (write + ClipboardItem). Feature-detects both
// before attempting. Throws a user-readable string on failure so callers can
// display it directly without string manipulation.
// ---------------------------------------------------------------------------
async function copyImageToClipboard(url: string): Promise<void> {
  const supported =
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof window.ClipboardItem !== "undefined";

  if (!supported) {
    throw "Trình duyệt chưa hỗ trợ sao chép ảnh. Hãy tải ảnh về máy.";
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw `Không thể tải ảnh để sao chép (${response.status}).`;
  }
  const blob = await response.blob();

  // ClipboardItem requires a supported MIME type; normalise to image/png when
  // the browser rejects the original type (Safari requires image/png).
  const mimeType = blob.type && blob.type.startsWith("image/")
    ? blob.type
    : "image/png";

  try {
    await navigator.clipboard.write([
      new window.ClipboardItem({ [mimeType]: blob }),
    ]);
  } catch {
    throw "Sao chép ảnh thất bại. Hãy thử tải ảnh về máy.";
  }
}

// ---------------------------------------------------------------------------
// Delay helper for sequential bulk download
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// ImageActionButtons
// ---------------------------------------------------------------------------
type ImageActionButtonsProps = {
  image: PickerImage;
  state: ImageState;
  onAction: (id: string, action: () => Promise<void>) => void;
  anyBusy: boolean;
};

function ImageActionButtons({
  image,
  state,
  onAction,
  anyBusy,
}: ImageActionButtonsProps) {
  const isBusy = state.status === "busy";
  const disabled = isBusy || anyBusy;

  // Infer mime type from the signed URL query string or fall back to jpeg
  function getMimeType(): string {
    try {
      const u = new URL(image.signedUrl);
      const ct = u.searchParams.get("Content-Type") ?? u.searchParams.get("content-type");
      if (ct && ct.startsWith("image/")) return ct;
    } catch {
      // ignore — fall through
    }
    return "image/jpeg";
  }

  const btnBase = [
    "inline-flex items-center justify-center rounded border px-1.5 py-1",
    "text-[11px] font-medium leading-none transition-colors outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:opacity-40",
    "border-border bg-background hover:bg-muted text-foreground",
  ].join(" ");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {/* Download */}
        <button
          type="button"
          disabled={disabled}
          aria-label="Tải ảnh về máy"
          className={btnBase}
          onClick={() =>
            onAction(image.id, () =>
              downloadImage(
                image.signedUrl,
                buildFilename(image.id, getMimeType())
              )
            )
          }
        >
          {isBusy ? "…" : "Tải ảnh"}
        </button>

        {/* Copy to clipboard */}
        <button
          type="button"
          disabled={disabled}
          aria-label="Sao chép ảnh vào clipboard"
          className={btnBase}
          onClick={() =>
            onAction(image.id, () => copyImageToClipboard(image.signedUrl))
          }
        >
          Sao chép
        </button>

        {/* Open in new tab */}
        <button
          type="button"
          disabled={disabled}
          aria-label="Mở ảnh trong tab mới"
          className={btnBase}
          onClick={() =>
            window.open(image.signedUrl, "_blank", "noopener,noreferrer")
          }
        >
          Mở ảnh
        </button>
      </div>

      {/* Per-image feedback */}
      {state.message && (
        <p
          className={cn(
            "text-[11px] leading-snug",
            state.status === "error"
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostImagePicker
// ---------------------------------------------------------------------------
export function PostImagePicker({ images, propertyId }: Props) {
  // --- Selection state ---
  const defaultSelectedId = (() => {
    const cover = images.find((img) => img.isCover);
    return cover ? cover.id : (images[0]?.id ?? null);
  })();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    defaultSelectedId ? new Set([defaultSelectedId]) : new Set()
  );

  // --- Per-image action state: Map<imageId, ImageState> ---
  const [imageStates, setImageStates] = useState<Map<string, ImageState>>(
    () => new Map()
  );

  // --- Bulk download state ---
  type BulkStatus = "idle" | "busy" | "done" | "error";
  const [bulkStatus, setBulkStatus] = useState<BulkStatus>("idle");
  const [bulkMessage, setBulkMessage] = useState<string>("");
  const [bulkProgress, setBulkProgress] = useState<string>("");

  // True when any individual image action is running
  const anyImageBusy = Array.from(imageStates.values()).some(
    (s) => s.status === "busy"
  );
  const isBulkBusy = bulkStatus === "busy";
  const anyBusy = anyImageBusy || isBulkBusy;

  // --- Helpers ---
  function setImageState(id: string, next: Partial<ImageState>) {
    setImageStates((prev) => {
      const current = prev.get(id) ?? { status: "idle", message: "" };
      return new Map(prev).set(id, { ...current, ...next });
    });
  }

  function clearImageStateAfter(id: string, ms: number) {
    setTimeout(() => {
      setImageStates((prev) =>
        new Map(prev).set(id, { status: "idle", message: "" })
      );
    }, ms);
  }

  function toggle(id: string) {
    if (anyBusy) return; // block selection changes while actions are running
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // --- Per-image action dispatcher ---
  const handleImageAction = useCallback(
    async (id: string, action: () => Promise<void>) => {
      setImageState(id, { status: "busy", message: "" });
      try {
        await action();
        setImageState(id, { status: "ok", message: "✓ Thành công" });
        clearImageStateAfter(id, 3000);
      } catch (err: unknown) {
        const message =
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : "Đã xảy ra lỗi. Thử lại sau.";
        setImageState(id, { status: "error", message });
        clearImageStateAfter(id, 6000);
      }
    },
    []
  );

  // --- Bulk download ---
  const handleBulkDownload = useCallback(async () => {
    if (anyBusy || selectedIds.size === 0) return;

    const toDownload = images.filter((img) => selectedIds.has(img.id));
    setBulkStatus("busy");
    setBulkMessage("");
    setBulkProgress(`0 / ${toDownload.length}`);

    let failed = 0;
    for (let i = 0; i < toDownload.length; i++) {
      const img = toDownload[i];

      // Infer mime type from URL query params or fall back
      let mimeType = "image/jpeg";
      try {
        const u = new URL(img.signedUrl);
        const ct =
          u.searchParams.get("Content-Type") ??
          u.searchParams.get("content-type");
        if (ct && ct.startsWith("image/")) mimeType = ct;
      } catch {
        // ignore
      }

      try {
        await downloadImage(img.signedUrl, buildFilename(img.id, mimeType));
      } catch {
        failed++;
      }

      setBulkProgress(`${i + 1} / ${toDownload.length}`);

      // Small inter-download delay so browsers don't throttle/block rapid
      // synthetic anchor clicks. Skip delay after the last item.
      if (i < toDownload.length - 1) await sleep(400);
    }

    if (failed === 0) {
      setBulkStatus("done");
      setBulkMessage(`✓ Đã tải ${toDownload.length} ảnh`);
    } else {
      setBulkStatus("error");
      setBulkMessage(
        `Tải xong ${toDownload.length - failed}/${toDownload.length} ảnh. ${failed} ảnh thất bại.`
      );
    }
    setBulkProgress("");
    setTimeout(() => {
      setBulkStatus("idle");
      setBulkMessage("");
    }, 5000);
  }, [anyBusy, selectedIds, images]);

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-5 py-8 text-center">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-xl"
          aria-hidden
        >
          📷
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Căn này chưa có ảnh</p>
          <p className="text-xs text-muted-foreground">
            Thêm ảnh để bài đăng thuyết phục hơn.
          </p>
        </div>
        <Link
          href={`/dashboard/properties/${propertyId}/images`}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-lg border border-border",
            "bg-background px-4 text-sm font-medium transition-colors hover:bg-muted",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          )}
        >
          Thêm ảnh căn nhà
        </Link>
      </div>
    );
  }

  const selectedCount = selectedIds.size;

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-3">
      {/* Selection count + bulk download */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {selectedCount === 0 ? "Chưa chọn ảnh nào" : `Đã chọn ${selectedCount} ảnh`}
        </p>

        {selectedCount > 0 && (
          <button
            type="button"
            disabled={anyBusy}
            onClick={handleBulkDownload}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-border",
              "bg-background px-3 py-1.5 text-xs font-medium transition-colors",
              "hover:bg-muted outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:pointer-events-none disabled:opacity-40"
            )}
          >
            {isBulkBusy ? (
              <>
                <span aria-hidden className="animate-pulse">⏳</span>
                {bulkProgress}
              </>
            ) : (
              <>
                <span aria-hidden>⬇️</span>
                Tải ảnh đã chọn
              </>
            )}
          </button>
        )}
      </div>

      {/* Bulk feedback */}
      {bulkMessage && (
        <p
          className={cn(
            "text-xs leading-snug",
            bulkStatus === "error"
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {bulkMessage}
        </p>
      )}

      {/* Image grid */}
      <div
        role="group"
        aria-label="Chọn ảnh để đăng bài"
        className="grid grid-cols-3 gap-x-2 gap-y-3"
      >
        {images.map((img) => {
          const isSelected = selectedIds.has(img.id);
          const imgState = imageStates.get(img.id) ?? {
            status: "idle" as ActionStatus,
            message: "",
          };

          return (
            <div key={img.id} className="flex flex-col gap-1">
              {/* Thumbnail toggle button */}
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={
                  img.altText ??
                  img.caption ??
                  (img.isCover ? "Ảnh bìa" : "Ảnh căn nhà")
                }
                onClick={() => toggle(img.id)}
                disabled={anyBusy}
                className={cn(
                  "relative overflow-hidden rounded-lg outline-none",
                  "transition-all",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  "disabled:cursor-default",
                  isSelected
                    ? "ring-2 ring-foreground ring-offset-1"
                    : "opacity-70 hover:opacity-100"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.signedUrl}
                  alt={img.altText ?? img.caption ?? "Ảnh căn nhà"}
                  className="h-24 w-full object-cover"
                />

                {/* Cover badge */}
                {img.isCover && (
                  <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1 py-px text-[10px] font-semibold leading-none text-background">
                    Bìa
                  </span>
                )}

                {/* Selection checkmark */}
                {isSelected && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background"
                  >
                    ✓
                  </span>
                )}
              </button>

              {/* Per-image action buttons + feedback */}
              <ImageActionButtons
                image={img}
                state={imgState}
                onAction={handleImageAction}
                anyBusy={anyBusy}
              />
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Ảnh chỉ dùng để hỗ trợ đăng bài. 1nha chưa tự đăng lên Facebook/Zalo ở phiên bản này.
      </p>
    </div>
  );
}
