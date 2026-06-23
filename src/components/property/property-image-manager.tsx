"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { PropertyImagePicker } from "@/components/property/property-image-picker";
import { uploadPropertyImagesToR2 } from "@/lib/images/upload-property-images";
import {
  requestProcessedPropertyImageUpload,
  finalizePropertyImageUpload,
  setPropertyCoverImage,
  deletePropertyImage,
  reorderPropertyImages,
} from "@/app/(dashboard)/dashboard/properties/[id]/images/actions";

export type ManagerImage = {
  id: string;
  url: string;
  fileName: string | null;
  isCover: boolean;
  sizeBytes: number | null;
};

type Props = {
  propertyId: string;
  /** Existing images in display order (cover → sort_order → created_at). */
  images: ManagerImage[];
};

// Friendly Vietnamese messages — never leak technical errors.
const ERR_DELETE = "Không xoá được ảnh. Vui lòng thử lại.";
const ERR_REORDER = "Không sắp xếp được ảnh. Vui lòng thử lại.";
const ERR_COVER = "Không đặt được ảnh bìa. Vui lòng thử lại.";
const ERR_ADD_PARTIAL =
  "Một số ảnh chưa tải lên thành công. Vui lòng thử lại.";

// ---------------------------------------------------------------------------
// PropertyImageManager — live image management for an EXISTING property.
//
// Used inside the edit form (and reusable elsewhere). Because the property
// already exists, every action persists immediately and independently of the
// property fields form: add (direct-to-R2), set cover, delete, reorder (up/down
// via sort_order). After each mutation it refreshes server data so the list +
// signed thumbnail URLs stay correct. No image bytes pass through a Server
// Action — add reuses the same uploadPropertyImagesToR2 helper as create.
// ---------------------------------------------------------------------------
export function PropertyImageManager({ propertyId, images }: Props) {
  const router = useRouter();

  // Add (select → upload) sub-flow.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [addKey, setAddKey] = useState(0); // bump to remount + reset the picker
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Per-image mutations (cover / delete / reorder) share one transition.
  const [isMutating, startMutate] = useTransition();
  const [mutateError, setMutateError] = useState<string | null>(null);

  const busy = uploading || isMutating;

  async function handleUpload() {
    if (uploading || pendingFiles.length === 0) return;
    setAddError(null);
    setUploading(true);

    const result = await uploadPropertyImagesToR2(
      propertyId,
      pendingFiles,
      {
        requestTargets: requestProcessedPropertyImageUpload,
        finalize: finalizePropertyImageUpload,
      },
      ({ index, total, phase }) =>
        setUploadStatus(
          phase === "processing"
            ? `Đang tối ưu ảnh ${index}/${total}…`
            : `Đang tải ảnh ${index}/${total}…`
        )
    );

    setUploadStatus(null);
    setUploading(false);
    if (result.failed > 0) {
      setAddError(result.firstError ?? ERR_ADD_PARTIAL);
    }
    // Reset the picker and reload images (so new thumbnails appear).
    setPendingFiles([]);
    setAddKey((k) => k + 1);
    router.refresh();
  }

  function runMutation(
    op: () => Promise<{ ok: true } | { ok: false; error: string }>,
    fallbackError: string
  ) {
    setMutateError(null);
    startMutate(async () => {
      try {
        const res = await op();
        if (!res.ok) {
          setMutateError(res.error || fallbackError);
          return;
        }
        router.refresh();
      } catch {
        setMutateError(fallbackError);
      }
    });
  }

  function handleSetCover(imageId: string) {
    runMutation(() => setPropertyCoverImage(propertyId, imageId), ERR_COVER);
  }

  function handleDelete(imageId: string) {
    if (!confirm("Xoá ảnh này? Hành động không thể hoàn tác.")) return;
    runMutation(() => deletePropertyImage(propertyId, imageId), ERR_DELETE);
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const ordered = images.map((i) => i.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    runMutation(
      () => reorderPropertyImages(propertyId, ordered),
      ERR_REORDER
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add images */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3">
        <p className="text-sm font-medium">Thêm ảnh</p>
        {addError && <FormError>{addError}</FormError>}
        <PropertyImagePicker
          key={addKey}
          onChange={setPendingFiles}
          disabled={busy}
        />
        {pendingFiles.length > 0 && (
          <Button
            type="button"
            onClick={handleUpload}
            disabled={busy}
            className="w-full"
          >
            {uploading
              ? (uploadStatus ?? "Đang tải lên…")
              : `Tải ${pendingFiles.length} ảnh lên`}
          </Button>
        )}
        {uploading && uploadStatus && (
          <p
            className="text-center text-xs text-muted-foreground"
            aria-live="polite"
          >
            {uploadStatus}
          </p>
        )}
      </div>

      {/* Existing images */}
      {mutateError && <FormError>{mutateError}</FormError>}

      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
          Chưa có hình ảnh nào. Thêm ảnh ở trên để dễ nhớ và chia sẻ với khách.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {images.map((img, index) => (
            <li
              key={img.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-2"
            >
              {/* Thumbnail */}
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.fileName ?? "Hình ảnh căn nhà"}
                  className="h-full w-full object-cover"
                />
                {img.isCover && (
                  <span className="absolute left-0.5 top-0.5 rounded bg-foreground/90 px-1 py-0.5 text-[9px] font-semibold text-background">
                    Bìa
                  </span>
                )}
              </div>

              {/* Reorder */}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label="Chuyển ảnh lên"
                  disabled={busy || index === 0}
                  onClick={() => handleMove(index, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Chuyển ảnh xuống"
                  disabled={busy || index === images.length - 1}
                  onClick={() => handleMove(index, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm disabled:opacity-40"
                >
                  ↓
                </button>
              </div>

              {/* Actions */}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                {!img.isCover && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleSetCover(img.id)}
                  >
                    Đặt làm bìa
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleDelete(img.id)}
                >
                  Xoá
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
