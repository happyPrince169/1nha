import type { Metadata } from "next";

import { MagicLinkForm } from "./magic-link-form";
import {
  Card,
  CardContent,
  CardDescription,
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
  const { status, error } = await searchParams;
  const isCheckEmail = status === "check_email";

  return (
    <div className="flex flex-col gap-6">
      {/* Branding */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">BrokerFlow AI</h1>
        <p className="text-sm text-muted-foreground">
          Đăng nhập để tiếp tục
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <CardDescription>
            {isCheckEmail
              ? "Kiểm tra hộp thư — chúng tôi đã gửi magic link cho bạn."
              : "Nhập email để nhận magic link đăng nhập."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isCheckEmail ? (
            <CheckEmailMessage />
          ) : (
            <MagicLinkForm serverError={error} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CheckEmailMessage() {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="text-4xl" role="img" aria-label="email">
        📬
      </span>
      <p className="text-sm text-muted-foreground">
        Magic link đã được gửi. Nhấn vào link trong email để đăng nhập —{" "}
        <span className="font-medium text-foreground">link có hiệu lực trong 1 giờ.</span>
      </p>
    </div>
  );
}
