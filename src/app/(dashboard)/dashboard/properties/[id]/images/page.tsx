import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploadForm } from "./image-upload-form";
import { ImageCard } from "./image-card";

export const metadata: Metadata = { title: "Hình ảnh căn nhà" };

const BUCKET = "property-images";
/** Signed URL TTL — 1 hour is enough for a browse session. */
const SIGNED_URL_TTL = 3600;

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

  // Fetch images ordered: cover first, then by sort_order, then created_at
  const { data: images, error } = await supabase
    .from("property_images")
    .select(
      "id, storage_path, file_name, mime_type, size_bytes, alt_text, caption, sort_order, is_cover, created_at"
    )
    .eq("property_id", id)
    .eq("user_id", user.id)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Generate signed URLs for all images in one batch call
  type ImageRow = NonNullable<typeof images>[number];
  type ImageWithUrl = ImageRow & { signedUrl: string };

  let imagesWithUrls: ImageWithUrl[] = [];

  if (images && images.length > 0) {
    const paths = images.map((img) => img.storage_path);
    const { data: signedData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);

    const urlMap = new Map<string, string>();
    for (const item of signedData ?? []) {
      if (item.path && item.signedUrl) {
        urlMap.set(item.path, item.signedUrl);
      }
    }

    imagesWithUrls = images.map((img) => ({
      ...img,
      signedUrl: urlMap.get(img.storage_path) ?? "",
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
