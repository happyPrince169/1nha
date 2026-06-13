"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveContent } from "./actions";

type Props = {
  contentId: string;
  disabled?: boolean;
};

export function ArchiveContentButton({ contentId, disabled }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "Lưu trữ content này? Nó sẽ không hiện trong danh sách chính nhưng vẫn có thể tìm lại."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await archiveContent(contentId);
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={handleClick}
      disabled={isPending || disabled}
      className="w-full"
    >
      {isPending ? "Đang lưu trữ…" : "Lưu trữ content"}
    </Button>
  );
}
