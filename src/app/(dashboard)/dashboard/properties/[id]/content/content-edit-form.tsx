"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/ui/form-error";
import { updateContentText, type UpdateTextState } from "./actions";

type Props = {
  contentId: string;
  initialText: string;
  disabled?: boolean;
};

const INITIAL_STATE: UpdateTextState = { error: null, success: false };

export function ContentEditForm({ contentId, initialText, disabled }: Props) {
  const boundAction = updateContentText.bind(null, contentId);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    INITIAL_STATE
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <FormError>{state.error}</FormError>}

      <Textarea
        name="output_text"
        // key reseeds the uncontrolled textarea after a successful save so it
        // reflects the server-revalidated value without requiring a controlled
        // component or an effect.
        key={state.success ? "saved" : "editing"}
        defaultValue={initialText}
        rows={10}
        disabled={isPending || disabled}
        aria-label="Nội dung bài đăng"
        className="resize-y text-sm leading-relaxed"
      />

      <div className="flex items-center justify-between gap-3">
        {state.success && !isPending && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Đã lưu thay đổi
          </p>
        )}

        <Button
          type="submit"
          size="sm"
          disabled={isPending || disabled}
          className="ml-auto"
        >
          {isPending ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
}
