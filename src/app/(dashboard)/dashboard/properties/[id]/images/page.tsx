import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getPropertyImageSignedUrls,
  R2_PENDING_PATH,
} from "@/lib/storage/property-media";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploadForm } from "./image-upload-form";
import { ImageCard } from "./image-card";

export const metadata: Metadata = { title: "Hình ảnh căn nhà" };

type Props = { params: Promise<{ id: string }> };

export default async function PropertyImagesPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Auth gate: verify property belongs to current user
  const { data: property } = await supabase
    .from("properties")
    .select("id, title, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!property) notFound();

  // Fetch images ordered: cover first, then by sort_order, then created_at.
  // Exclude not-yet-finalized rows from either provider.
  const { data: images, error } = await supabase
    .from("property_images")
    .select(
      "id, storage_path, file_name, mime_type, size_bytes, alt_text, caption, sort_order, is_cover, created_at, storage_provider, original_key, thumbnail_key, preview_key"
    )
    .eq("property_id", id)
    .eq("user_id", user.id)
    .neq("storage_path", "__pending__")
    .neq("storage_path", R2_PENDING_PATH)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Generate signed URLs for all images — batched per provider by the abstraction.
  type ImageRow = NonNullable<typeof images>[number];
  type ImageWithUrl = ImageRow & { signedUrl: string };

  let imagesWithUrls: ImageWithUrl[] = [];

  if (images && images.length > 0) {
    // Gallery grid is a preview surface — prefer thumbnails for fast loading.
    // Falls back to preview_key → original_key (and legacy Supabase paths).
    const urlById = await getPropertyImageSignedUrls(images, supabase, {
      variant: "thumbnail",
    });
    imagesWithUrls = images.map((img) => ({
      ...img,
      signedUrl: urlById.get(img.id) ?? "",
    }));
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
          {error.message}
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
