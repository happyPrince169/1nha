"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyImagePicker } from "@/components/property/property-image-picker";
import {
  PropertyImageManager,
  type ManagerImage,
} from "@/components/property/property-image-manager";

// Shared copy so every property/source form reads identically.
const TITLE = "Hình ảnh căn nhà";
const HELPER_DRAFT = "Bạn có thể thêm ảnh ngay bây giờ hoặc bổ sung sau.";
const HELPER_EXISTING_PRIMARY =
  "Bạn có thể thêm, xoá, sắp xếp và chọn ảnh bìa cho nguồn này.";
const HELPER_EXISTING_SECONDARY =
  "Ảnh bìa sẽ được dùng làm ảnh đại diện khi xem trong kho nguồn.";

type DraftProps = {
  mode: "draft";
  /** Receives the selected File[] (uploaded by the parent AFTER create). */
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
};

type ExistingProps = {
  mode: "existing";
  propertyId: string;
  images: ManagerImage[];
};

type Props = DraftProps | ExistingProps;

// ---------------------------------------------------------------------------
// PropertyImageSection — the single, consistent "Hình ảnh căn nhà" section
// shared by every property/source form.
//
//   • mode="draft"    — no propertyId yet (manual create + quick-add review).
//                       Collect pending images; the parent uploads them to R2
//                       AFTER the property is created.
//   • mode="existing" — propertyId exists (edit form). Full live management:
//                       add / delete / set cover / reorder, applied immediately.
// ---------------------------------------------------------------------------
export function PropertyImageSection(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {props.mode === "draft" ? (
          <>
            <p className="text-sm text-muted-foreground">{HELPER_DRAFT}</p>
            <PropertyImagePicker
              onChange={props.onFilesChange}
              disabled={props.disabled}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {HELPER_EXISTING_PRIMARY}
            </p>
            <p className="text-xs text-muted-foreground">
              {HELPER_EXISTING_SECONDARY}
            </p>
            <PropertyImageManager
              propertyId={props.propertyId}
              images={props.images}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
