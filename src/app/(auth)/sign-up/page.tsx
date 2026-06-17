import type { Metadata } from "next";

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

      <Card>
        <CardHeader>
          <CardTitle>Tạo tài khoản 1nha</CardTitle>
          <CardDescription>
            Đăng ký bằng email và mật khẩu để bắt đầu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </div>
  );
}
