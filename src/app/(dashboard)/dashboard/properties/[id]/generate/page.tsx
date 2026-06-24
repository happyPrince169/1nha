import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { tryGetRequestContext } from "@/lib/workspace/request-context";
import { toApiError } from "@/lib/api/errors";
import { getPropertyById } from "@/lib/services/properties";
import { canManageProperty } from "@/lib/workspace/permissions";
import { listStyleProfiles } from "@/lib/services/style-profiles";
import { generatePropertyContent } from "./actions";
import { GenerateForm, type StyleProfileOption } from "./generate-form";
import { ManageForbidden } from "@/components/property/manage-notice";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = { title: "Tạo content AI" };

export default async function GeneratePage({ params }: Props) {
  const { id } = await params;

  // Organization-scoped reads via the shared services (Phase 3D alignment).
  const ctx = await tryGetRequestContext();
  if (!ctx) return null;

  // Confirm the property is in the current workspace before rendering.
  let property;
  try {
    property = await getPropertyById(ctx, id);
  } catch (err) {
    if (toApiError(err).code === "NOT_FOUND") notFound();
    throw err;
  }

  // Phase 4C: generating content is a management action on the property.
  if (!canManageProperty(ctx, property)) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Tạo content AI</h1>
          <Link
            href={`/dashboard/properties/${id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            ← Chi tiết
          </Link>
        </div>
        <ManageForbidden
          title="Bạn không thể tạo content cho nguồn này"
          backHref={`/dashboard/properties/${id}`}
          backLabel="← Về chi tiết nguồn"
        />
      </div>
    );
  }

  // Saved writing-style profiles for the workspace (default first, then newest).
  const { profiles } = await listStyleProfiles(ctx);
  const profileOptions: StyleProfileOption[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    platform: p.platform,
    is_default: p.is_default,
  }));

  // Bind the property id into the action server-side.
  const boundAction = generatePropertyContent.bind(null, id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Tạo content AI</h1>
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

      <GenerateForm action={boundAction} profiles={profileOptions} />
    </div>
  );
}
