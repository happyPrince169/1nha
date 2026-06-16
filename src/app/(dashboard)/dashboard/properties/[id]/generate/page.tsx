import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { generatePropertyContent } from "./actions";
import { GenerateForm, type StyleProfileOption } from "./generate-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = { title: "Tạo content AI" };

export default async function GeneratePage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Confirm the property exists and belongs to this user before rendering.
  const { data: property } = await supabase
    .from("properties")
    .select("id,title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!property) notFound();

  // Saved writing-style profiles for this user. Scoped by user_id; default
  // first, then most recent. style_rules is selected but not shipped to the
  // client form — the action re-fetches it server-side when generating.
  const { data: styleProfiles } = await supabase
    .from("content_style_profiles")
    .select("id,name,platform,is_default,style_rules")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  const profileOptions: StyleProfileOption[] = (styleProfiles ?? []).map(
    (p) => ({
      id: p.id as string,
      name: p.name as string,
      platform: (p.platform as string | null) ?? null,
      is_default: Boolean(p.is_default),
    })
  );

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
