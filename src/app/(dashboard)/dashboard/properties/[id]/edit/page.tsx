import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { tryGetRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import { getPropertyById } from "@/lib/services/properties";
import { buildAssigneeContext } from "@/lib/services/workspace";
import { canEditProperty } from "@/lib/workspace/permissions";
import { ManageForbidden } from "@/components/property/manage-notice";
import { listPropertyImages } from "@/lib/services/property-images";
import { updateProperty } from "./actions";
import { PropertyForm } from "../../property-form";
import { PropertyImageSection } from "@/components/property/property-image-section";
import type { ManagerImage } from "@/components/property/property-image-manager";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Chỉnh sửa bất động sản" };
}

export default async function EditPropertyPage({ params }: Props) {
  const { id } = await params;

  // Organization-scoped read via the shared service (Phase 3D alignment).
  const ctx = await tryGetRequestContext();
  if (!ctx) return null;

  let property;
  try {
    property = await getPropertyById(ctx, id);
  } catch (err) {
    if (toApiError(err).code === "NOT_FOUND") notFound();
    throw err;
  }

  // Phase 4C: a Member who is neither creator nor assignee cannot edit. Show a
  // friendly read-only block instead of the editable form (the update action +
  // API enforce this too).
  if (!canEditProperty(ctx, property)) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Chỉnh sửa</h1>
          <Link
            href={`/dashboard/properties/${id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            ← Chi tiết
          </Link>
        </div>
        <ManageForbidden
          title="Bạn không thể chỉnh sửa nguồn này"
          backHref={`/dashboard/properties/${id}`}
          backLabel="← Về chi tiết nguồn"
        />
      </div>
    );
  }

  // Bind the property id into the action on the server so the client never
  // controls which row gets updated.
  const boundAction = updateProperty.bind(null, id);

  // Phase 4B: assignee context (members + role) for the "Người phụ trách" field.
  const assignee = await buildAssigneeContext(ctx);

  // Existing images for the live manager (thumbnails; pending rows excluded by
  // the service). A read failure must not break field editing — fall back to []
  // so the manager still lets the user add images.
  let managerImages: ManagerImage[] = [];
  try {
    const items = await listPropertyImages(ctx, id, { variant: "thumbnail" });
    managerImages = items.map((img) => ({
      id: img.id,
      url: img.url ?? "",
      fileName: img.file_name,
      isCover: img.is_cover,
      sizeBytes: img.size_bytes,
    }));
  } catch {
    managerImages = [];
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Chỉnh sửa</h1>
        <Link
          href={`/dashboard/properties/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Chi tiết
        </Link>
      </div>

      <PropertyForm
        action={boundAction}
        submitLabel="Lưu thay đổi"
        assignee={assignee}
        defaultValues={{
          assigned_to: property.assigned_to,
          title: property.title ?? "",
          property_type: property.property_type ?? "",
          city: property.city ?? "Hà Nội",
          district: property.district ?? "",
          ward: property.ward ?? "",
          street: property.street ?? "",
          price: property.price != null ? Number(property.price) : "",
          area: property.area != null ? Number(property.area) : "",
          bedrooms: property.bedrooms != null ? Number(property.bedrooms) : "",
          bathrooms: property.bathrooms != null ? Number(property.bathrooms) : "",
          house_direction: property.house_direction ?? "",
          frontage: property.frontage != null ? Number(property.frontage) : "",
          alley_width: property.alley_width != null ? Number(property.alley_width) : "",
          legal_status: property.legal_status ?? "",
          description: property.description ?? "",
          strengths: property.strengths ?? "",
          weaknesses: property.weaknesses ?? "",
          owner_note: property.owner_note ?? "",
          planning_note: property.planning_note ?? "",
        }}
      />

      {/* Live image management — persists immediately and independently of the
          property fields form above. An image failure never blocks editing. */}
      <PropertyImageSection
        mode="existing"
        propertyId={id}
        images={managerImages}
      />
    </div>
  );
}
