import type { Metadata } from "next";

import { SignInForm } from "./sign-in-form";
import { PhoneSignInForm } from "./phone-sign-in-form";
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

  // Friendly Vietnamese status banners. `tone` controls styling: "success"
  // (green) vs "error" (red) for failed/expired email links.
  const STATUS_BANNERS: Record<
    string,
    { tone: "success" | "error"; message: string }
  > = {
    password_updated: {
      tone: "success",
      message: "Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.",
    },
    check_email: {
      tone: "success",
      message:
        "Đã gửi link đăng nhập. Vui lòng kiểm tra email — link có hiệu lực trong 1 giờ.",
    },
    link_expired: {
      tone: "error",
      message:
        "Link đã hết hạn hoặc không còn hợp lệ. Vui lòng gửi lại email đặt mật khẩu mới.",
    },
    auth_link_error: {
      tone: "error",
      message:
        "Không thể xác thực link email. Vui lòng thử gửi lại link mới.",
    },
  };

  const banner = status ? STATUS_BANNERS[status] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Branding */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">1nha</h1>
        <p className="text-sm text-muted-foreground">Đăng nhập để tiếp tục</p>
      </div>

      {/* Primary: phone + SMS OTP */}
      <Card>
        <CardHeader>
          <CardTitle>Đăng nhập bằng số điện thoại</CardTitle>
          <CardDescription>
            Nhập số di động để nhận mã OTP qua SMS. Nhanh và không cần mật khẩu.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {banner && (
            <p
              className={
                banner.tone === "error"
                  ? "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  : "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
              }
            >
              {banner.message}
            </p>
          )}
          <PhoneSignInForm />
        </CardContent>
      </Card>

      {/* Fallback: email + password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tiếp tục bằng email</CardTitle>
          <CardDescription>
            Vẫn dùng được email và mật khẩu như trước.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <SignInForm />
        </CardContent>

        <CardFooter className="justify-center">
          <MagicLinkFallback />
        </CardFooter>
      </Card>
    </div>
  );
}
