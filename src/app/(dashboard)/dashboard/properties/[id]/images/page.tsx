import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { tryGetRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import { getPropertyById } from "@/lib/services/properties";
import { listPropertyImages } from "@/lib/services/property-images";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploadForm } from "./image-upload-form";
import { ImageCard } from "./image-card";

export const metadata: Metadata = { title: "Hình ảnh căn nhà" };

type Props = { params: Promise<{ id: string }> };

export default async function PropertyImagesPage({ params }: Props) {
  const { id } = await params;

  // Organization-scoped reads via the shared services (Phase 3D alignment).
  const ctx = await tryGetRequestContext();
  if (!ctx) return null;

  // Verify the property is in the current workspace before rendering.
  let property;
  try {
    property = await getPropertyById(ctx, id);
  } catch (err) {
    if (toApiError(err).code === "NOT_FOUND") notFound();
    throw err;
  }

  // Gallery grid is a preview surface — thumbnails for fast loading. The
  // service excludes not-yet-finalized rows and applies cover/sort/created order.
  let imagesWithUrls: Array<
    Awaited<ReturnType<typeof listPropertyImages>>[number] & {
      signedUrl: string;
    }
  > = [];
  let error: string | null = null;
  try {
    const items = await listPropertyImages(ctx, id, { variant: "thumbnail" });
    imagesWithUrls = items.map((img) => ({ ...img, signedUrl: img.url ?? "" }));
  } catch (err) {
    error = toApiError(err).message;
  }

  const canUpload = property.status !== "archived";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Hình ảnh căn nhà
          </h1>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {property.title}
          </p>
        </div>
        <Link
          href={`/dashboard/properties/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Chi tiết
        </Link>
      </div>

      {/* Upload form */}
      {canUpload && (
        <Card>
          <CardHeader>
            <CardTitle>Tải ảnh mới lên</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageUploadForm propertyId={id} />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Empty state */}
      {!error && imagesWithUrls.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-3xl"
            aria-hidden
          >
            📷
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">Chưa có hình ảnh nào</p>
            <p className="text-sm text-muted-foreground">
              Tải ảnh căn nhà lên để dễ nhớ và chia sẻ với khách.
            </p>
          </div>
        </div>
      )}

      {/* Image grid */}
      {imagesWithUrls.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {imagesWithUrls.length} ảnh
          </p>

          <div className="flex flex-col gap-4">
            {imagesWithUrls.map((img) => (
              <ImageCard
                key={img.id}
                propertyId={id}
                imageId={img.id}
                signedUrl={img.signedUrl}
                fileName={img.file_name}
                caption={img.caption}
                altText={img.alt_text}
                isCover={img.is_cover}
                sizeBytes={img.size_bytes}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
