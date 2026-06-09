import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArchiveButton } from "./archive-button";
import { StatusBadge } from "../status-badge";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Bất động sản ${id}` };
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id,title,property_type,status,city,district,ward,street,price,area,bedrooms,bathrooms,house_direction,frontage,alley_width,legal_status,description,strengths,weaknesses,owner_note,planning_note,created_at"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !property) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard/properties"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Danh sách
        </Link>
        <StatusBadge status={property.status} />
      </div>

      {property.status !== "archived" && (
        <div className="flex flex-col gap-2">
          <Link
            href={`/dashboard/properties/${id}/generate`}
            className={cn(buttonVariants({ size: "lg" }), "h-11 w-full justify-center")}
          >
            ✨ Tạo content AI
          </Link>
          <div className="flex gap-2">
            <Link
              href={`/dashboard/properties/${id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1 justify-center")}
            >
              Chỉnh sửa
            </Link>
            <ArchiveButton id={id} />
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg leading-snug">{property.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {[property.city, property.district, property.ward, property.street]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Row label="Giá" value={formatVND(Number(property.price ?? 0))} />
          <Row label="Diện tích" value={`${property.area ?? 0} m²`} />
          <Row label="Loại" value={propertyTypeLabel(property.property_type)} />
          {property.bedrooms != null && (
            <Row label="Phòng ngủ" value={String(property.bedrooms)} />
          )}
          {property.bathrooms != null && (
            <Row label="Phòng tắm" value={String(property.bathrooms)} />
          )}
          {property.house_direction && (
            <Row label="Hướng nhà" value={directionLabel(property.house_direction)} />
          )}
          {property.frontage != null && (
            <Row label="Mặt tiền" value={`${property.frontage} m`} />
          )}
          {property.alley_width != null && (
            <Row label="Đường vào" value={`${property.alley_width} m`} />
          )}
          <Row label="Pháp lý" value={legalStatusLabel(property.legal_status)} />
        </CardContent>
      </Card>

      <NotesCard title="Mô tả" value={property.description} />
      <NotesCard title="Điểm mạnh" value={property.strengths} />
      <NotesCard title="Điểm yếu" value={property.weaknesses} />
      <NotesCard title="Ghi chú chủ nhà" value={property.owner_note} />
      <NotesCard title="Ghi chú quy hoạch" value={property.planning_note} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function NotesCard({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
        {value}
      </CardContent>
    </Card>
  );
}

function directionLabel(d: string | null | undefined) {
  switch (d) {
    case "east": return "Đông";
    case "west": return "Tây";
    case "south": return "Nam";
    case "north": return "Bắc";
    case "southeast": return "Đông Nam";
    case "southwest": return "Tây Nam";
    case "northeast": return "Đông Bắc";
    case "northwest": return "Tây Bắc";
    default: return d ?? "-";
  }
}

function propertyTypeLabel(type: string | null | undefined) {
  switch (type) {
    case "apartment":
      return "Căn hộ";
    case "house":
      return "Nhà phố";
    case "land":
      return "Đất";
    case "shophouse":
      return "Shophouse";
    case "villa":
      return "Villa";
    case "office":
      return "Văn phòng";
    case "other":
      return "Khác";
    default:
      return type ?? "-";
  }
}

function legalStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "red_book":
      return "Sổ đỏ";
    case "pink_book":
      return "Sổ hồng";
    case "sale_contract":
      return "HĐ mua bán";
    case "hand_written":
      return "Giấy tay";
    case "other":
      return "Khác";
    default:
      return status ?? "-";
  }
}
