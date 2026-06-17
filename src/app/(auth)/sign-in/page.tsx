import type { Metadata } from "next";

import { SignInForm } from "./sign-in-form";
import { MagicLinkFallback } from "./magic-link-fallback";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Đăng nhập" };

type SearchParams = Promise<{ status?: string; error?: string; next?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status } = await searchParams;

  const banner =
    status === "password_updated"
      ? "Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại."
      : status === "check_email"
        ? "Đã gửi link đăng nhập. Vui lòng kiểm tra email — link có hiệu lực trong 1 giờ."
        : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Branding */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">1nha</h1>
        <p className="text-sm text-muted-foreground">Đăng nhập để tiếp tục</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <CardDescription>
            Dùng email và mật khẩu để đăng nhập vào 1nha.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {banner && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              {banner}
            </p>
          )}
          <SignInForm />
        </CardContent>

        <CardFooter className="justify-center">
          <MagicLinkFallback />
        </CardFooter>
      </Card>
    </div>
  );
}
