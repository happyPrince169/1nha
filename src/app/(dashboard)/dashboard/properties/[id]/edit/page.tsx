import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { updateProperty } from "./actions";
import { PropertyForm } from "../../property-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Chỉnh sửa bất động sản` };
}

export default async function EditPropertyPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id,title,property_type,city,district,ward,street,price,area,bedrooms,bathrooms,house_direction,frontage,alley_width,legal_status,description,strengths,weaknesses,owner_note,planning_note"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !property) notFound();

  // Bind the property id into the action on the server so the client never
  // controls which row gets updated.
  const boundAction = updateProperty.bind(null, id);

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
        defaultValues={{
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
    </div>
  );
}
