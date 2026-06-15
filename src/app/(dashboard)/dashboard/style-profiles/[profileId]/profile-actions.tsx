"use client";

import { useActionState, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import {
  updateStyleProfile,
  setDefaultProfile,
  deleteStyleProfile,
  type UpdateProfileState,
} from "../actions";

// ---------------------------------------------------------------------------
// EditProfileForm
// ---------------------------------------------------------------------------
type EditFormProps = {
  profileId: string;
  initialName: string;
  initialDescription: string | null;
  initialIsDefault: boolean;
};

const EDIT_INITIAL: UpdateProfileState = { error: null, success: false };

export function EditProfileForm({
  profileId,
  initialName,
  initialDescription,
  initialIsDefault,
}: EditFormProps) {
  const boundAction = updateStyleProfile.bind(null, profileId);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    EDIT_INITIAL
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormError>{state.error}</FormError>}

      {state.success && !isPending && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          ✓ Đã lưu thay đổi
        </p>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-name">Tên văn phong</Label>
        <Input
          id="edit-name"
          name="name"
          key={state.success ? "saved" : "editing"}
          defaultValue={initialName}
          maxLength={100}
          required
          disabled={isPending}
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-description">Mô tả (tuỳ chọn)</Label>
        <Textarea
          id="edit-description"
          name="description"
          key={state.success ? "saved" : "editing"}
          defaultValue={initialDescription ?? ""}
          rows={3}
          placeholder="Ghi chú về phong cách này, dùng cho dịp nào…"
          disabled={isPending}
          className="resize-y text-sm"
        />
      </div>

      {/* Set as default */}
      <div className="flex items-center gap-3">
        <input
          id="edit-is-default"
          name="is_default"
          type="checkbox"
          disabled={isPending || initialIsDefault}
          defaultChecked={initialIsDefault}
          className="h-4 w-4 cursor-pointer rounded border-border accent-foreground disabled:cursor-default"
        />
        <Label
          htmlFor="edit-is-default"
          className={
            initialIsDefault
              ? "cursor-default text-sm text-muted-foreground"
              : "cursor-pointer text-sm"
          }
        >
          {initialIsDefault
            ? "Đây là văn phong mặc định hiện tại"
            : "Đặt làm văn phong mặc định"}
        </Label>
      </div>

      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isPending}
        className="self-end"
      >
        {isPending ? "Đang lưu…" : "Lưu thay đổi"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// SetDefaultButton
// ---------------------------------------------------------------------------
type SetDefaultProps = {
  profileId: string;
  isDefault: boolean;
};

export function SetDefaultButton({ profileId, isDefault }: SetDefaultProps) {
  const [isPending, startTransition] = useTransition();

  if (isDefault) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
        <span aria-hidden>✓</span>
        Đang là văn phong mặc định
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await setDefaultProfile(profileId);
        });
      }}
    >
      {isPending ? "Đang cập nhật…" : "⭐ Đặt làm mặc định"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// DeleteProfileButton
// ---------------------------------------------------------------------------
type DeleteProps = {
  profileId: string;
  profileName: string;
};

export function DeleteProfileButton({ profileId, profileName }: DeleteProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (
      !confirm(
        `Xoá văn phong "${profileName}"?\n\nHành động này không thể hoàn tác.`
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deleteStyleProfile(profileId);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/dashboard/style-profiles");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <FormError>{error}</FormError>}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-full"
        disabled={isPending}
        onClick={handleDelete}
      >
        {isPending ? "Đang xoá…" : "Xoá văn phong này"}
      </Button>
    </div>
  );
}
