"use client";

import { useTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import {
  setPropertyCoverImage,
  deletePropertyImage,
  updatePropertyImageMeta,
  type UpdateImageMetaState,
} from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ImageCardProps = {
  propertyId: string;
  imageId: string;
  signedUrl: string;
  fileName: string | null;
  caption: string | null;
  altText: string | null;
  isCover: boolean;
  sizeBytes: number | null;
};

const META_INITIAL: UpdateImageMetaState = { error: null };

// ---------------------------------------------------------------------------
// ImageCard
// ---------------------------------------------------------------------------
export function ImageCard({
  propertyId,
  imageId,
  signedUrl,
  fileName,
  caption,
  altText,
  isCover,
  sizeBytes,
}: ImageCardProps) {
  const [showMeta, setShowMeta] = useState(false);

  // Cover action
  const [coverPending, startCoverTransition] = useTransition();
  function handleSetCover() {
    startCoverTransition(async () => {
      await setPropertyCoverImage(propertyId, imageId);
    });
  }

  // Delete action
  const [deletePending, startDeleteTransition] = useTransition();
  function handleDelete() {
    if (
      !confirm(
        "Xoá ảnh này? Hành động không thể hoàn tác."
      )
    )
      return;
    startDeleteTransition(async () => {
      await deletePropertyImage(propertyId, imageId);
    });
  }

  // Meta update
  const boundUpdateMeta = updatePropertyImageMeta.bind(
    null,
    propertyId,
    imageId
  );
  const [metaState, metaFormAction, metaPending] = useActionState(
    boundUpdateMeta,
    META_INITIAL
  );

  const isPending = coverPending || deletePending || metaPending;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/10">
      {/* Image */}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signedUrl}
          alt={altText ?? fileName ?? "Hình ảnh căn nhà"}
          className="h-48 w-full object-cover"
        />
        {isCover && (
          <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-foreground/90 px-2 py-0.5 text-xs font-semibold text-background">
            Ảnh bìa
          </span>
        )}
      </div>

      {/* Info + actions */}
      <div className="flex flex-col gap-2 p-3">
        {/* Caption */}
        {caption && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {caption}
          </p>
        )}

        {/* File info */}
        {sizeBytes != null && (
          <p className="text-xs text-muted-foreground/60">
            {(sizeBytes / 1024).toFixed(0)} KB
          </p>
        )}

        {/* Primary action row */}
        <div className="flex gap-2">
          {!isCover && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleSetCover}
              className="flex-1"
            >
              {coverPending ? "Đang đặt…" : "Đặt làm bìa"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => setShowMeta((v) => !v)}
            className={isCover ? "flex-1" : ""}
          >
            {showMeta ? "Đóng" : "Chú thích"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={handleDelete}
          >
            {deletePending ? "…" : "Xoá"}
          </Button>
        </div>

        {/* Inline meta edit form — collapsed by default */}
        {showMeta && (
          <form action={metaFormAction} className="flex flex-col gap-2 pt-1">
            {metaState.error && (
              <FormError>{metaState.error}</FormError>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={`caption-${imageId}`} className="text-xs">
                Chú thích
              </Label>
              <Input
                id={`caption-${imageId}`}
                name="caption"
                defaultValue={caption ?? ""}
                placeholder="Phòng khách, view sân vườn…"
                disabled={metaPending}
                className="h-9 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`alt-${imageId}`} className="text-xs">
                Mô tả ảnh (alt text)
              </Label>
              <Input
                id={`alt-${imageId}`}
                name="alt_text"
                defaultValue={altText ?? ""}
                placeholder="Nhà phố 4 tầng, quận 2…"
                disabled={metaPending}
                className="h-9 text-xs"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={metaPending}
              className="self-end"
            >
              {metaPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
