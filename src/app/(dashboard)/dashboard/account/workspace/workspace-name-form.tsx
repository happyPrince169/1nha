"use client";

// ---------------------------------------------------------------------------
// WorkspaceNameForm — owner/admin can rename the workspace. Members see a
// read-only name (rendered by the page, this form is only mounted for managers).
// ---------------------------------------------------------------------------
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import {
  renameWorkspaceAction,
  type RenameWorkspaceState,
} from "./actions";

const INITIAL: RenameWorkspaceState = { error: null, success: false };

export function WorkspaceNameForm({ name }: { name: string }) {
  const [state, formAction, isPending] = useActionState(
    renameWorkspaceAction,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <FormError>{state.error}</FormError>}
      {state.success && !isPending && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          ✓ Đã đổi tên không gian làm việc
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="workspace_name">Tên không gian làm việc</Label>
        <Input
          id="workspace_name"
          name="name"
          key={state.success ? "saved" : "editing"}
          defaultValue={name}
          maxLength={80}
          placeholder="VD: Nhóm môi giới Quận 7"
          disabled={isPending}
        />
      </div>

      <Button type="submit" disabled={isPending} className="h-11 w-full">
        {isPending ? "Đang lưu…" : "Lưu tên"}
      </Button>
    </form>
  );
}
