import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "./sign-up-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Tạo tài khoản" };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">1nha</h1>
        <p className="text-sm text-muted-foreground">
          Kho nguồn & trợ lý đăng bài cho môi giới BĐS
        </p>
      </div>

      {/* Phone-first nudge — phone OTP both signs up and signs in. */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed">
        Bạn có thể đăng ký/đăng nhập nhanh bằng số điện thoại. Email vẫn có thể
        dùng làm phương án dự phòng.{" "}
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Dùng số điện thoại →
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tạo tài khoản bằng email</CardTitle>
          <CardDescription>
            Đăng ký bằng email và mật khẩu (phương án dự phòng).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </div>
  );
}
