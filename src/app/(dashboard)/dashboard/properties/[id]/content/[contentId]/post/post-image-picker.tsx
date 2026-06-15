"use client";

import { useState } from "react";
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

type Props = {
  images: PickerImage[];
  propertyId: string;
};

// ---------------------------------------------------------------------------
// PostImagePicker
// ---------------------------------------------------------------------------
export function PostImagePicker({ images, propertyId }: Props) {
  // Pre-select: cover image if one exists, otherwise the first image.
  const defaultSelectedId = (() => {
    const cover = images.find((img) => img.isCover);
    return cover ? cover.id : images[0]?.id ?? null;
  })();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    defaultSelectedId ? new Set([defaultSelectedId]) : new Set()
  );

  function toggle(id: string) {
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

  // Empty state
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

  return (
    <div className="flex flex-col gap-3">
      {/* Selected count */}
      <p className="text-xs text-muted-foreground">
        {selectedCount === 0
          ? "Chưa chọn ảnh nào"
          : `Đã chọn ${selectedCount} ảnh`}
      </p>

      {/* Grid */}
      <div
        role="group"
        aria-label="Chọn ảnh để đăng bài"
        className="grid grid-cols-3 gap-2"
      >
        {images.map((img) => {
          const isSelected = selectedIds.has(img.id);
          return (
            <button
              key={img.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={
                img.altText ?? img.caption ?? (img.isCover ? "Ảnh bìa" : "Ảnh căn nhà")
              }
              onClick={() => toggle(img.id)}
              className={cn(
                "relative overflow-hidden rounded-lg outline-none",
                "transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
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

              {/* Checkmark overlay when selected */}
              {isSelected && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background"
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Ảnh chỉ dùng để hỗ trợ đăng bài. 1nha chưa tự đăng lên Facebook/Zalo
        ở phiên bản này.
      </p>
    </div>
  );
}
