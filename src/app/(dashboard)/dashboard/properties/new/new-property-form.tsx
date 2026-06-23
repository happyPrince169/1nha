"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { PropertyImagePicker } from "@/components/property/property-image-picker";
import { uploadPropertyImagesToR2 } from "@/lib/images/upload-property-images";
import { PropertyFields, type PropertyFormDefaults } from "../property-form";
import { createPropertyWithImages } from "./actions";
import {
  requestProcessedPropertyImageUpload,
  finalizePropertyImageUpload,
} from "../[id]/images/actions";

type Props = {
  defaultValues?: PropertyFormDefaults;
};

// ---------------------------------------------------------------------------
// NewPropertyForm — create a property with OPTIONAL images in one flow.
//
// One flow to the user, two safe technical steps to the system:
//   1. createPropertyWithImages(formData) → propertyId   (no image bytes here)
//   2. if images: uploadPropertyImagesToR2(propertyId, files) → direct-to-R2
//   3. redirect to the property (or its images page if some uploads failed)
//
// The property is NEVER rolled back when an image upload fails — the broker has
// already entered the source; they can re-upload from the images page.
// ---------------------------------------------------------------------------
export function NewPropertyForm({ defaultValues }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending || !formRef.current) return;

    setError(null);
    setIsPending(true);

    // Step 1 — create the property (fields only; no image bytes).
    setStatusMsg("Đang lưu thông tin căn…");
    let propertyId: string;
    try {
      const formData = new FormData(formRef.current);
      const res = await createPropertyWithImages(formData);
      if (!res.ok) {
        setError(res.error);
        setStatusMsg(null);
        setIsPending(false);
        return;
      }
      propertyId = res.propertyId;
    } catch {
      setError("Không lưu được thông tin căn. Vui lòng thử lại.");
      setStatusMsg(null);
      setIsPending(false);
      return;
    }

    // No images selected → straight to the property detail.
    if (files.length === 0) {
      setStatusMsg("Đang chuyển trang…");
      router.push(`/dashboard/properties/${propertyId}`);
      return;
    }

    // Step 2 — upload images directly to R2. The property is already saved, so a
    // partial failure never rolls it back.
    const result = await uploadPropertyImagesToR2(
      propertyId,
      files,
      {
        requestTargets: requestProcessedPropertyImageUpload,
        finalize: finalizePropertyImageUpload,
      },
      ({ index, total, phase }) =>
        setStatusMsg(
          phase === "processing"
            ? `Đang tối ưu ảnh ${index}/${total}…`
            : `Đang tải ảnh ${index}/${total}…`
        )
    );

    // Step 3 — finish. Navigation ends the pending state by unmounting.
    setStatusMsg("Đang hoàn tất…");
    if (result.failed > 0) {
      // Some images failed; land on the images page with a friendly notice so
      // the broker can retry. The property and any successful images are saved.
      router.push(`/dashboard/properties/${propertyId}/images?upload=partial`);
      return;
    }
    router.push(`/dashboard/properties/${propertyId}`);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}

      <PropertyFields defaultValues={defaultValues} disabled={isPending} />

      <Card>
        <CardHeader>
          <CardTitle>Hình ảnh căn nhà</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Bạn có thể thêm ảnh ngay bây giờ hoặc bổ sung sau.
          </p>
          <PropertyImagePicker onChange={setFiles} disabled={isPending} />
        </CardContent>
      </Card>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? (statusMsg ?? "Đang lưu…") : "Tạo bất động sản"}
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
