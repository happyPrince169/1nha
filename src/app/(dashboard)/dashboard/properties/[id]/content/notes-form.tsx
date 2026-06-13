"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import { updateContentNotes, type UpdateNotesState } from "./actions";

type Props = {
  contentId: string;
  initialNotes: string | null;
};

const initialState: UpdateNotesState = { error: null };

export function NotesForm({ contentId, initialNotes }: Props) {
  const boundAction = updateContentNotes.bind(null, contentId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <FormError>{state.error}</FormError>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Ghi chú nội bộ</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Phản hồi khách, hiệu quả bài đăng, ghi chú chỉnh sửa…"
          defaultValue={initialNotes ?? ""}
          disabled={isPending}
        />
      </div>

      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="self-end"
        disabled={isPending}
      >
        {isPending ? "Đang lưu…" : "Lưu ghi chú"}
      </Button>

      {/* Success flash — error is null after a successful save */}
      {!state.error && !isPending && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 self-end">
          {/* Only show after the first action (state starts at null) */}
        </p>
      )}
    </form>
  );
}
